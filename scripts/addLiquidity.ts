// this tutorial follows: https://docs.uniswap.org/sdk/v3/guides/liquidity/modifying-position
// for detailed concept of Uniswap, check https://docs.uniswap.org/sdk/v3/guides/background

import { encodeSqrtRatioX96, FeeAmount, nearestUsableTick, NonfungiblePositionManager, Pool, Position, TICK_SPACINGS, tickToPrice } from "@uniswap/v3-sdk";
import {abi as ERC20ABI} from '../artifacts/ERC20.json';
import {abi as UniswapFactoryABI} from '../artifacts/UniswapV3Factory.json';
import {abi as PoolABI} from '../artifacts/UniswapV3Pool.json';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
import {Percent, Token} from '@uniswap/sdk-core';
import * as ethers from 'ethers';
import JSBI from "jsbi";

const RPC_URL = "http://devnet.nodekit.xyz/javelin-reverse/rpc"
const KEY = "0xa5d9350e81413bfce309fda540f8856df0fce4b9857b05efedef72d0b1fe1221"
const WETH_ADDR = "0x4200000000000000000000000000000000000006";
const SYN_ADDR = "0x4A679253410272dd5232B3Ff7cF5dbB88f295319"; // synthetic ERC20 token
const NFTPM = "0x95401dc811bb5740090279Ba06cfA8fcF6113778"; // nonfungibleTokenPositionManagerAddress
const FACTORY_ADDR = "0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E";
const CHAIN_ID = 45207;

const FEE = FeeAmount.LOW;

async function main() {
    // init provider
    const network = new ethers.Network('chain45207', 45207);
    const provider = new ethers.JsonRpcProvider(RPC_URL, network, {
        staticNetwork: network,
        batchMaxSize: 1,
    });
    const signer = new ethers.Wallet(KEY, provider);

    // get or create pool
    const uniswapFactory = new ethers.Contract(FACTORY_ADDR, UniswapFactoryABI, signer);
    var poolAddress: string = await uniswapFactory.getPool(WETH_ADDR, SYN_ADDR, FEE);
    if(poolAddress === '0x0000000000000000000000000000000000000000') {
        console.log("pool not exists, creating")
        poolAddress = await createPool(uniswapFactory, WETH_ADDR, SYN_ADDR, FEE)

        // 1 weth to swap 1 synthetic or vice versa
        const price = encodeSqrtRatioX96(10, 1);
        await initializePool(poolAddress, price, signer);
    }
    console.log(`pool address: ${poolAddress}`)

    const token0 = new ethers.Contract(WETH_ADDR, ERC20ABI, signer);
    const token1 = new ethers.Contract(SYN_ADDR, ERC20ABI, signer);
    const amount0 = ethers.parseUnits('10000000', 18);
    const amount1 = ethers.parseUnits('1000000', 18);
    await token0.approve(NFTPM, amount0);
    await token1.approve(NFTPM, amount1);

    await addLiquidityToPool(poolAddress, signer, 45207, 18, 18, token0, token1, amount0, amount1, FEE, NFTPM)
}

async function createPool(factory: ethers.Contract, token0: string, token1: string, fee: number) {
    const txs = await factory.createPool(token0, token1, fee, {
        gasLimit: 5694097
    });
    await txs.wait()
    
    const poolCreated: string = await factory.getPool(token0, token1, fee);
    return poolCreated;
}

async function initializePool(pool: string, price: JSBI, signer: ethers.Signer) {
    const poolContract = new ethers.Contract(pool, PoolABI, signer);
    var txs = await poolContract.initialize(price.toString(), {
        gasLimit: 3000000,
    });
    await txs.wait();
    console.log('Pool Initialized');
}

async function getPoolState(poolContract: ethers.Contract) {
    const liquidity = await poolContract.liquidity();
    const slot = await poolContract.slot0();

    const PoolState = {
        liquidity,
        sqrtPriceX96: slot[0],
        tick: slot[1],
        observationIndex: slot[2],
        observationCardinality: slot[3],
        observationCardinalityNext: slot[4],
        feeProtocol: slot[5],
        unlocked: slot[6],
    };

    return PoolState;
}

async function addLiquidityToPool(
    poolAdd: string,
    deployer: ethers.Signer,
    chainId: number,
    Token1_decimals: number,
    Token2_decimals: number,
    token_contract1: ethers.Contract,
    token_contract2: ethers.Contract,
    amount0: ethers.BigNumberish, amount1: ethers.BigNumberish,
    fee: number,
    npmca: string
) {
    const poolContract = new ethers.Contract(poolAdd, PoolABI, deployer);
    var state = await getPoolState(poolContract);


    const Token1 = new Token(chainId, await token_contract1.getAddress(), Token1_decimals);
    const Token2 = new Token(chainId, await token_contract2.getAddress(), Token2_decimals);

    const configuredPool = new Pool(
        Token1,
        Token2,
        fee,
        state.sqrtPriceX96.toString(),
        state.liquidity.toString(),
        Number(state.tick)
    );

    const position = Position.fromAmounts({
        pool: configuredPool,
        tickLower:
            nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) -
            configuredPool.tickSpacing * 2,
        tickUpper:
            nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) +
            configuredPool.tickSpacing * 2,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        useFullPrecision: false,
    });

    const deployerAddresss = await deployer.getAddress();
    const mintOptions = {
        recipient: deployerAddresss,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
    };

    const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, mintOptions);

    const transaction = {
        data: calldata,
        to: npmca,
        value: value,
        from: deployerAddresss,
        gasLimit: 10000000
    };
    console.log('Transacting');
    const txRes = await deployer.sendTransaction(transaction);
    await txRes.wait();
    console.log('Added liquidity');
}

main()