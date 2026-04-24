# Retrospective 

- **Name:** Santiago Ellena
- **Project name:** Aperio
- **Repo URL:** https://github.com/santiellena/aperio-polkadot
- **Path chosen:** CLI + Smart Contracts in Solidity (Tried both EVM and PVM) + DotNS static web.

---

## What I built

A decentralized censorship-resistant repository platform. Git keeps code and history off-chain, Bulletin stores Git bundle artifacts, and the smart contract records canonical repository decisions: HEAD, proposals, reviews, merges, and releases. 

Our first target market is high-stakes, treasury-backed open source.

This project solves the problem of relying on centralized authorities to control our open-source repositories. Acting as a coordination layer for the actors around the repositories (maintainers, reviewers, contributors, and others stakeholders).

---

## Why I picked this path

I chose the Solidity smart contract path (tried both EVM and PVM) mostly because I was intrigued about how this pallet_revive would work and how the different schemes will work together (Polkadot vs EVM keys). At the same time, this is one of the most recent additions to the Polkadot infraestructure and got immediately my attention.

---

## What worked

- Most of the tools worked well but there were some DX friction. 
- Dot.li felt smooth to use and well polished. 
- That APIs in general were simple enough. 
- Bulletin chain showed reliability.


## What broke

- Not something broken per se but having SO MANY new tools and ways of doing things in a short time, and the lack of guidance with proper documentation, made it hard.

- I tried the whole week to use the CLI as host but encountered with many issues like, lack of allowance to use statement store, tools built for Polkadot App and not particularly for pwallet, lack of information. 

- I tried hard to create a tool for apps running on the terminal, where the flow is `Auth with QR -> Creating extrinsic -> Requesting pwallet to approve -> Receive approval -> Submit`. The most hard part was actually "Requesting pwallet to approve"

- pwallet accounts had to be mapped and that created so much friction in the DX because we weren't aware of that.

- pwallet verification identity requirement was needed but the UI hid the button and the extrinsics failed without a clear reason.

- pwallet debugging is extremely hard. It's a tool build for users not for devs (at all). Added a way of solving it here: https://github.com/paritytech/pwallet/pull/28 

- The sandbox environment of Dot.li didn't allow me to put a button to download blobs from Bulletin chain directly and that created some friction for the user. Because they had to use curl in the terminal to download the bundle or copy a link in their browser manuallly.

- pwallet UI breaks when new wallets are created (working on a PR for this).

- Fun fact: if you run pwallet locally, and then run the project dapp locally too, it breaks because of the cache memory in the browser. I struggled 1.5 hours to figure out that. (will submit some kind of fix for this too)

- https://github.com/shawntabrizi/polkadot-stack-template/pull/16 - https://github.com/paritytech/dotns/issues/133

---

## What I'd do differently

- Documentation, for sure.
- Fixing bugs.
- Not changing how things work, I believe it is already mature and the stack needs only to be polished and tested.

---

## Stack feedback for Parity

I'm repeting myself here but I will compress all my feedback in this section.

I believe the stack is mature enough (at least the path I took) to start creating deep technical documentation and testing functionalities (not only the happy paths), to then fix the bugs that arise and make the DX smooth.

The one thing I'd loved to have working well is pwallet, the entry point and the tool for testing. These 2 weeks we all have encountered friction with that, and that created huge delay in the building process.

Overall the stack feels powerful and well prepared for the web 3.0, really.

---

## Links
All the links were placed where I talked about them but here you have all of them:

- Live deployment: https://aperio.dot.li/
- PRs submitted: 
    - https://github.com/shawntabrizi/polkadot-stack-template/pull/16 
    - https://github.com/paritytech/pwallet/pull/28 
- Bugs report submitted: 
    - https://github.com/paritytech/dotns/issues/133
    - and working on some more for pwallet.
