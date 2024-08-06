import { Dex } from "../../service/util/types";

export function run_mm_sequence({
    token,
    amm,
    cycles,
    numWallets,
    tradesPerWallet,
    fundingAmount,
    fundsPerWallet,
    fundingWallet,
    userWallet
}: {
    token: string,
    amm: Dex,
    cycles: number,
    numWallets: number,
    tradesPerWallet: number,
    fundingAmount: number,
    fundsPerWallet: number,
    fundingWallet: string,
    userWallet: string
}){
    const requestBody = {
        token,
        amm,
        cycles,
        numWallets,
        tradesPerWallet,
        fundingAmount,
        fundsPerWallet
    };

    return fetch('http://localhost:3001/api/mm/run_mm', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .catch(error => {
        console.error('There was a problem with the fetch operation:', error);
    });
}