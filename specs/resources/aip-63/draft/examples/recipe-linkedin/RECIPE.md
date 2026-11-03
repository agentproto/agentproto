---
schema: recipe/v1
id: linkedin
version: 1.0.0
title: LinkedIn
api: 1
sites: [linkedin.com]
accounts: [linkedin.com]
tools: [linkedin_profile, linkedin_message]
workflows: [linkedin-job-search]
writes: { linkedin_message: approve }
probes: [profile]
entry: dist/index.js
guide: guide/GUIDE.md
publisher: agentik
---

The LinkedIn recipe packages one site for a browser host: its PlatformKit
slice, a read tool that reads a profile, a write tool that sends a message
behind an approval gate, one job-search workflow, a guide for agents and a
profile probe. It needs a logged-in LinkedIn Account and never navigates off
`linkedin.com` or its subdomains.
