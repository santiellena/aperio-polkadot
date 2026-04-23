# Notes on the project status (MVP)

- There could be a "slashing" mechanism for the maintainer to slash reviewers who are not behaving appropiately.

- In case the spam becomes a problem a fee to submit a proposal could be included. And released then once the proposal gets merged.

- Currently it is not implemented the feature of restricting an organization name to a single address because the idea is to allow many maintainters to have access to the same organization. Governance systems are handy here.

- The maintainer is not limited to be a user address, this is the case only for the demo/MVP purpose. The idea is that the maintainer is managed by a DAO and the decisions are taken by the token holders of the DAO (stakeholders of the repository).

- Treasury is used to pay contributors and reviewers, but this is not the only use case for those funds, they could be used to refresh the latest CID on the Bulletin chain (and many more creative things that the governance can come up with!).

- In the future an add "releases" feature would be nice to have so the end user can go and download that directly (some releases are compressed binaries). 

- The current architecture limits really big repositories because of the max size of data allowed to submit on Bulletin chain.

- In the MVP, the statement store is not used. But it could and should be used to contstruct a chat between maintainer, reviewers and contributor, so they can ask and give feedback, or talk about something not understood by code alone. 