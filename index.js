import {SimpleRpcClient} from './rpc.js';

class SimpleIndexer {
    constructor() {
        // Indexing history for each name here
        this.nameHistory = {};
    }

    /**
     * Process block
     * @param height the block height
     * @param blockHash the block hash
     * @param block the Bitcoin block data
     * @param spaceTxs any transactions relevant to Spaces in this block
     */
    async processBlock(height, blockHash, block, spaceTxs) {
        if (spaceTxs.length === 0) {
            // No spaces transactions in this block
            return;
        }
        // Found a spaces transaction
        for (let tx of spaceTxs) {
            await this.handleSpacesTx(tx);
        }
    }

    async handleSpacesTx(tx) {
        // First check if some transaction outputs are spaces
        for (let output_index = 0; output_index < tx.vout.length; output_index++) {
            let output = tx.vout[output_index];
            if (output.name) {
                // We can derive the Outpoint here:
                const outpoint = `${tx.txid}:${output_index}`;
                console.log(`Found '${output.name}' in ${outpoint}`);

                // Store the derived Outpoint
                output.outpoint = outpoint;

                // Update name history
                if (this.nameHistory[output.name]) {
                    this.nameHistory[output.name].push(output);
                } else {
                    this.nameHistory[output.name] = [output];
                }
            }
        }

        // Meta outputs: these are additional space outputs being updated
        // by this transaction.
        for (let metaOutput of tx.vmetaout) {
            if (metaOutput.name) {
                // All meta outputs have an Outpoint
                if (this.nameHistory[metaOutput.name]) {
                    this.nameHistory[metaOutput.name].push(metaOutput);
                } else {
                    this.nameHistory[metaOutput.name] = [metaOutput];
                }
                continue;
            }

            // Some space was revoked or an auction was rejected
            // if action is revoke that means the current space is affected
            // if action is reject it's just rejecting the transaction
            // happens if the name already exists ... etc.
            if (metaOutput.action) {
                let name = metaOutput.target.name;
                this.nameHistory[name] = metaOutput;
                continue;
            }
            console.error("Unknown meta output type: ", metaOutput);
        }
    }

}


async function main() {
    // Change rpc endpoints based on network
    const bitcoinClient = new SimpleRpcClient('http://localhost:18332', 'test', 'test');
    const spacedClient = new SimpleRpcClient('http://localhost:22221');

    let simpleIndexer = new SimpleIndexer();

    // The block height at which the spaces protocol was activated on testnet
    // You may change this to 0 if using regtest
    let tip = 2865460;
    const blockCount = await bitcoinClient.request('getblockcount');

    if (blockCount < tip) {
        console.log('Bitcoin core is still syncing. Please wait for it to catch up.');
        return;
    }

    while (tip < blockCount) {
        let blockHash = await bitcoinClient.request('getblockhash', [tip]);

        // You can fetch the whole block from bitcoin core
        let block = await bitcoinClient.request('getblock', [blockHash]);

        // Spaced indexes transactions relevant to the spaces protocol by the block hash
        // if a block does not have any spaces transactions, it will not be stored in the index
        let spacesData = await spacedClient.request('getblockdata', [blockHash]);
        let txData = spacesData && spacesData.tx_data ? spacesData.tx_data : [];

        console.log('Process block height:', tip, 'block hash:', blockHash, ' space tx count:', txData.length);
        await simpleIndexer.processBlock(tip, blockHash, block, txData);
        tip++;
    }

    try {
        console.log('Processed up to block:', tip);
        console.log('Indexed history: ');
        // Just reading name history
        for (let name in simpleIndexer.nameHistory) {
            console.log(`Space: ${name}`);

            let last_covenant = null;
            let last_claim_height = null;

            for (let output of simpleIndexer.nameHistory[name]) {
                if (output.covenant) {
                    let covenant = output.covenant;

                    // If last covenant was a bid and current covenant is a transfer
                    // then we can assume that the name was registered
                    if (last_covenant && last_covenant.type === 'bid' && covenant.type === 'transfer') {
                        console.log(`Register`);
                        continue;
                    }


                    if (covenant.type === 'bid') {
                        // Auction rollout claim height was set
                        if (last_claim_height === null && covenant.claim_height) {
                            console.log('  Rollout');
                            continue;
                        }

                        const bid_amount = covenant.total_burned;
                        console.log(`  Bid: ${bid_amount} sats`);
                    }

                    if (covenant.type === 'transfer') {
                        // You can parse the script_pubkey to determine address here
                        console.log('  Transfer');
                    }

                    last_covenant = output.covenant;
                    last_claim_height = covenant.claim_height ? covenant.claim_height : null;
                }
            }
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main().then(() => {
}).catch((error) => {
    console.error(error);
});
