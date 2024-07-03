# Spaced indexer example

This repo is a quick example for indexing Spaces on Bitcoin using `spaced` and `bitcoind`.


### Enable block indexing

Make sure to run `spaced` with block indexing enabled:

```bash
spaced --chain test --bitcoin-rpc-user test --bitcoin-rpc-password test --index-blocks
```

Update the rpc configuration in index.js if needed

```javascript
// Change rpc endpoints based on network
const bitcoinClient = new SimpleRpcClient('http://localhost:18332', 'test', 'test');
const spacedClient = new SimpleRpcClient('http://localhost:22221');
```


## Run the indexer

```bash
npm run start
```
