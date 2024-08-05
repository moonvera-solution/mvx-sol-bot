
export function run_mm_sequence({
    cycles,
    numWallets,
    tradesPerWallet,
    fundingAmount,
    fundsPerWallet
}: {
    cycles: number,
    numWallets: number,
    tradesPerWallet: number,
    fundingAmount: number,
    fundsPerWallet: number,
}) {
    const requestBody = {
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