use crate::commands::{hash_input, resolve_substrate_signer};
use clap::Subcommand;
use subxt::ext::scale_value;
use subxt::utils::AccountId32;
use subxt::OnlineClient;
use subxt::PolkadotConfig;

#[derive(Subcommand)]
pub enum PalletAction {
    /// Create a proof-of-existence claim for a file or hash
    CreateClaim {
        /// The 0x-prefixed blake2b-256 hash to claim
        #[arg(group = "input")]
        hash: Option<String>,
        /// Path to a file (will be hashed with blake2b-256)
        #[arg(long, group = "input")]
        file: Option<String>,
        /// Also upload the file to the Bulletin Chain (IPFS)
        #[arg(long, requires = "file")]
        upload: bool,
        /// Signer: dev name (alice/bob/charlie), mnemonic, or 0x secret seed
        #[arg(long, short, default_value = "alice")]
        signer: String,
    },
    /// Revoke a proof-of-existence claim
    RevokeClaim {
        /// The 0x-prefixed hash to revoke
        hash: String,
        /// Signer: dev name (alice/bob/charlie), mnemonic, or 0x secret seed
        #[arg(long, short, default_value = "alice")]
        signer: String,
    },
    /// Get the claim details for a hash
    GetClaim {
        /// The 0x-prefixed hash to look up
        hash: String,
    },
    /// List all claims stored in the pallet
    ListClaims,
}

/// Extract (owner_ss58, block_number) from a dynamic claim Value (tuple of AccountId, u32).
fn format_claim<T: Clone>(value: &scale_value::Value<T>) -> (String, String) {
    if let scale_value::ValueDef::Composite(scale_value::Composite::Unnamed(ref fields)) = value.value {
        let owner = fields
            .first()
            .and_then(|f| {
                // AccountId is encoded as 32 bytes
                if let scale_value::ValueDef::Composite(scale_value::Composite::Unnamed(ref bytes)) = f.value {
                    let raw: Vec<u8> = bytes
                        .iter()
                        .filter_map(|b| {
                            if let scale_value::ValueDef::Primitive(scale_value::Primitive::U128(n)) = &b.value {
                                Some(*n as u8)
                            } else {
                                None
                            }
                        })
                        .collect();
                    if raw.len() == 32 {
                        let account = AccountId32::from(<[u8; 32]>::try_from(raw.as_slice()).unwrap());
                        return Some(account.to_string());
                    }
                }
                None
            })
            .unwrap_or_else(|| format!("{}", fields.first().map(|f| format!("{f}")).unwrap_or_default()));
        let block = fields
            .get(1)
            .map(|f| format!("{f}"))
            .unwrap_or_else(|| "?".to_string());
        (owner, block)
    } else {
        (format!("{value}"), "?".to_string())
    }
}

fn parse_hash(hex: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    if hex.len() != 64 {
        return Err("Hash must be 32 bytes (64 hex characters)".into());
    }
    Ok((0..64)
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
        .collect::<Result<Vec<_>, _>>()?)
}

pub async fn run(action: PalletAction, url: &str) -> Result<(), Box<dyn std::error::Error>> {
    let api = OnlineClient::<PolkadotConfig>::from_url(url).await?;

    match action {
        PalletAction::CreateClaim {
            hash,
            file,
            upload,
            signer,
        } => {
            let (hash_hex, file_bytes) = hash_input(hash, file.as_deref())?;
            let hash_bytes = parse_hash(&hash_hex)?;
            let keypair = resolve_substrate_signer(&signer)?;

            if upload {
                let bytes = file_bytes.ok_or("--upload requires --file")?;
                crate::commands::upload_to_bulletin(&bytes, &keypair).await?;
            }

            let tx = subxt::dynamic::tx(
                "TemplatePallet",
                "create_claim",
                vec![("hash", subxt::dynamic::Value::from_bytes(hash_bytes))],
            );
            let result = api
                .tx()
                .sign_and_submit_then_watch_default(&tx, &keypair)
                .await?
                .wait_for_finalized_success()
                .await?;
            println!(
                "create_claim finalized in block: {}",
                result.extrinsic_hash()
            );
        }
        PalletAction::RevokeClaim { hash, signer } => {
            let hash_bytes = parse_hash(&hash)?;
            let keypair = resolve_substrate_signer(&signer)?;
            let tx = subxt::dynamic::tx(
                "TemplatePallet",
                "revoke_claim",
                vec![("hash", subxt::dynamic::Value::from_bytes(hash_bytes))],
            );
            let result = api
                .tx()
                .sign_and_submit_then_watch_default(&tx, &keypair)
                .await?
                .wait_for_finalized_success()
                .await?;
            println!(
                "revoke_claim finalized in block: {}",
                result.extrinsic_hash()
            );
        }
        PalletAction::GetClaim { hash } => {
            let hash_bytes = parse_hash(&hash)?;
            let storage_query = subxt::dynamic::storage(
                "TemplatePallet",
                "Claims",
                vec![subxt::dynamic::Value::from_bytes(hash_bytes)],
            );
            let result = api
                .storage()
                .at_latest()
                .await?
                .fetch(&storage_query)
                .await?;
            match result {
                Some(value) => {
                    let v = value.to_value()?;
                    let (owner, block) = format_claim(&v);
                    println!("Claim found:");
                    println!("  Hash:  {hash}");
                    println!("  Owner: {owner}");
                    println!("  Block: {block}");
                }
                None => println!("No claim found for this hash"),
            }
        }
        PalletAction::ListClaims => {
            let storage_query = subxt::dynamic::storage(
                "TemplatePallet",
                "Claims",
                Vec::<subxt::dynamic::Value>::new(),
            );
            let mut results = api
                .storage()
                .at_latest()
                .await?
                .iter(storage_query)
                .await?;

            println!("{:<68} {:<50} {}", "HASH", "OWNER", "BLOCK");
            println!("{}", "-".repeat(130));

            let mut count = 0u32;
            while let Some(Ok(kv)) = results.next().await {
                let key_len = kv.key_bytes.len();
                let hash = format!("0x{}", hex::encode(&kv.key_bytes[key_len - 32..]));
                let value = kv.value.to_value()?;
                let (owner, block) = format_claim(&value);

                println!("{:<68} {:<50} {}", hash, owner, block);
                count += 1;
            }

            if count == 0 {
                println!("(no claims found)");
            } else {
                println!("{}", "-".repeat(130));
                println!("{count} claim(s) total");
            }
        }
    }

    Ok(())
}
