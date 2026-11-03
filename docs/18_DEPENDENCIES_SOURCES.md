# 18 — Sources, Provider Facts, Operational Assumptions

**Checked date:** 2026-11-01; these are engineering research pointers, not live API credentials or proof of production readiness. Refresh docs with Codex when implementation begins.

1. Codex CLI, local repo files, AGENTS: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan ; https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex
2. Codex long horizon / milestones: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
3. Jupiter Swap API V2: https://github.com/jup-ag/docs/blob/main/swap/index.mdx ; https://github.com/jup-ag/docs/blob/main/swap/order-and-execute.mdx
4. Jupiter API access: https://github.com/jup-ag/docs/blob/main/llms.txt (verify requirement for API key and rate limits at implementation)
5. Solana RPC: https://solana.com/docs/rpc ; https://solana.com/docs/rpc/http/sendtransaction ; https://solana.com/docs/rpc/http/getsignaturestatuses
6. Solana token programs and ATA/rent: https://solana.com/docs/tokens ; https://solana.com/docs/payments/how-payments-work
7. DEX Screener API: https://docs.dexscreener.com/api/reference
8. Phantom integration: https://docs.phantom.com/solana/integrating-phantom
9. Phantom Auto-Confirm limited sessions and supported dApps: https://help.phantom.com/articles/19385761078547
10. ChatGPT vs API billing: https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
11. Indonesian licensed crypto platform registry: https://ojk.go.id/id/Fungsi-Utama/ITSK/Perizinan-ITSK-Aset-Keuangan-Digital-Aset-Kripto/

## What is verified vs assumed

- Verified from docs: Solana offers RPC read/send and WebSocket subscriptions; confirmation needs chain check; Jupiter V2 order/execute exists; Phantom wallet can connect web apps; Phantom Auto-Confirm is bounded; ChatGPT Plus does not automatically cover OpenAI API; OJK publishes regulated provider lists.
- Product choice, NOT a provider fact: TypeScript/Next.js/PostgreSQL; 11 software modules; split wallet architecture; zero initial caps; 24h shadow gate; UX routes; numeric performance targets; all must be implemented and tested.
- Not verified: Grok reference app identity/transactions, video profit authenticity, exactly matching latency or profits, user wallet funds, eligibility for paid RPC, whether particular meme coins have Jupiter route, which exchange user will choose, any bank withdrawal timing.
- All API schemas / docs may change; freeze adapter contract at M0 and update with official documentation, not guesswork.
