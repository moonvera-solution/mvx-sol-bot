



solana-test-validator --clone TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --clone 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 --clone JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN --url https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b411
solana --url http://127.0.0.1:8899 airdrop 10000 refKNTCjEZXq57H9oxvdYfQU5pCYCf3gUWS6gXNCdHR

# download raydium program
solana program dump -u m 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 raydium_dex_v3.so
# load into local testnet
solana-test-validator --bpf-program 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 raydium_dex_v3.so --reset

