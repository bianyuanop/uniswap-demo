### Swapping Synthetic token to WETH 

This demo has three parts:

1. create Uniswap liquidity pool (WETH <-> Synthetic)
2. add liquidity to the pool(WETH <-> Synthetic)
3. swap Synthetic token to WETH or vice versa

The code is simple and straight forward but you have to understand basic Uniswap concept, so before starting of running/modifying/reading the code, please check [this](https://docs.uniswap.org/sdk/v3/guides/background).

All the scripts needed to create pool, add liquidity or swap tokens locate in [scripts](./scripts) folder. 

You have first to install dependencies by 

```shell
yarn install 
```

Then you can run any of the scripts by

```shell
npx ts-node ./scripts/<script-name>.ts
```

