// the quoting part of this demo follows the trading tutorial on Uniswap Official Tutorial, See: https://docs.uniswap.org/sdk/v3/guides/swaps/trading
// for the swaping part, we are directly calling the `exactInputSingle` method of swapRouter02 to swap

import { Token, Currency, CurrencyAmount, TradeType } from "@uniswap/sdk-core";
import {abi as UniswapFactoryABI} from '../artifacts/UniswapV3Factory.json';
import {abi as PoolABI} from '../artifacts/UniswapV3Pool.json';
import {abi as Router02ABI} from '../artifacts/SwapRouter02.json';
import {abi as ERC20ABI} from '../artifacts/ERC20.json';
import { FeeAmount, Pool, Route, SwapQuoter, SwapRouter, Trade } from "@uniswap/v3-sdk";
import {BigNumberish, ethers} from 'ethers';

const RPC_URL = "http://devnet.nodekit.xyz/javelin-reverse/rpc"
const SWAP_ROUTER02_ADDR = "0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf";
const QUOTER_CONTRACT_ADDRESS = "0x4826533B4897376654Bb4d4AD88B7faFD0C98528";
const POOL_FEE = FeeAmount.LOW;
const KEY = "0x574f69c77680ca128d2ed233e69513070f66253a654a59327d8435c283379066"
const WETH_ADDR = "0x4200000000000000000000000000000000000006";
const FACTORY_ADDR = "0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E";
const SYN_ADDR = "0x4A679253410272dd5232B3Ff7cF5dbB88f295319"; // synthetic ERC20 token
const SYN_AMOUNT_IN = 100000000;

const CHAIN_ID = 45207;

interface ExactInputSingleParams {
  tokenIn: string
  tokenOut: string
  fee: number
  recipient: string
  amountIn: number
  amountOutMinimum: number
  sqrtPriceLimitX96: number
}

async function main() {
  const network = new ethers.Network('chain45207', 45207);
  const provider = new ethers.JsonRpcProvider(RPC_URL, network, {
      staticNetwork: network,
      batchMaxSize: 1,
  });
  const signer = new ethers.Wallet(KEY, provider);
  const startingNonce = await signer.getNonce()

  const uniswapFactory = new ethers.Contract(FACTORY_ADDR, UniswapFactoryABI, signer);
  var poolAddress: string = await uniswapFactory.getPool(WETH_ADDR, SYN_ADDR, POOL_FEE);
  if(poolAddress === '0x0000000000000000000000000000000000000000') {
      console.log("pool not exists, check params please")
      return
  }
  console.log(`pool address: ${poolAddress}`)
  const poolContract = new ethers.Contract(poolAddress, PoolABI, signer);
  const [liquidity, slot0] = await Promise.all([poolContract.liquidity(), poolContract.slot0()])

  const synContract = new ethers.Contract(SYN_ADDR, ERC20ABI, signer);
  const wethContract = new ethers.Contract(WETH_ADDR, ERC20ABI, signer);
  const startBalanceSyn = await synContract.balanceOf(await signer.getAddress())
  const startBalanceWeth = await wethContract.balanceOf(await signer.getAddress())
  console.log(`starting balances: Synthetic(${startBalanceSyn}) WETH(${startBalanceWeth})`)

  // get a quote: check how much we can swap from the amount of synthetic token
  const tokenIn = new Token(CHAIN_ID, SYN_ADDR, 18)
  const tokenOut = new Token(CHAIN_ID, WETH_ADDR, 18)
  const pool = new Pool(
      tokenIn, 
      tokenOut, 
      POOL_FEE, 
      slot0.sqrtPriceX96.toString(),
      liquidity.toString(),
      Number(slot0.tick)
  )

  const swapRoute = new Route([pool], tokenIn, tokenOut)
  const amountOut = await getOutputQuote(provider, swapRoute, tokenIn, SYN_AMOUNT_IN)
  console.log(`amount of WETH can swap ${amountOut}`)

  // approve token in
  const tokenInContract = new ethers.Contract(SYN_ADDR, ERC20ABI, signer);
  const txApprove: ethers.TransactionResponse = await tokenInContract.approve(SWAP_ROUTER02_ADDR, SYN_AMOUNT_IN, {
    nonce: startingNonce
  })
  console.log(`txApprove hash: ${txApprove.hash}`)
  const approveReceipt = await txApprove.wait()
  console.log(approveReceipt)

  // swap Synthetic token to WETH
  const router02 = new ethers.Contract(SWAP_ROUTER02_ADDR, Router02ABI, signer);
  const params: ExactInputSingleParams = {
    tokenIn: SYN_ADDR,
    tokenOut: WETH_ADDR,
    fee: POOL_FEE,
    recipient: await signer.getAddress(),
    amountIn: SYN_AMOUNT_IN,
    amountOutMinimum: 0, 
    sqrtPriceLimitX96: 0 // we don't care sliperage 
  }
  // gas estimate(simulating tx)
  // const gas = await router02.exactInputSingle.estimateGas(params);
  // console.log(gas)

  const tx = await router02.exactInputSingle(params);
  console.log(`swap tx hash: ${tx.hash}`)
  const receipt = await tx.wait()
  console.log(receipt)

  const endBalanceSyn = await synContract.balanceOf(await signer.getAddress())
  const endBalanceWeth = await wethContract.balanceOf(await signer.getAddress())
  console.log(`ending balances: Synthetic(${endBalanceSyn}) WETH(${endBalanceWeth})`)


  // TODO: had to be some parametric issues, the following code won't work
  // const uncheckedTrade = Trade.createUncheckedTrade({
  //   route: swapRoute,
  //   inputAmount: CurrencyAmount.fromRawAmount(
  //     tokenIn,
  //     JSBI.BigInt(SYN_AMOUNT_IN)
  //   ),
  //   outputAmount: CurrencyAmount.fromRawAmount(
  //     tokenOut,
  //     JSBI.BigInt(amountOut)
  //   ),
  //   tradeType: TradeType.EXACT_INPUT,
  // })

  // const options: SwapOptions = {
  //   slippageTolerance: new Percent(50, 10_000), // 50 bips, or 0.50%
  //   deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
  //   recipient: await signer.getAddress(),
  //   type: SwapType.SWAP_ROUTER_02
  // }

  // const swapParam = SwapRouter.swapCallParameters([uncheckedTrade], options)
  // const tx: ethers.TransactionRequest = {
  //   data: swapParam.calldata,
  //   value: swapParam.value,
  //   to: SWAP_ROUTER02_ADDR,
  //   from: await signer.getAddress(),
  //   maxFeePerGas: 1000000000,
  //   maxPriorityFeePerGas: 10000000
  // }

  // const swapGas = await signer.estimateGas(tx);
  // console.log(swapGas)
}

async function getOutputQuote(provider: ethers.Provider, route: Route<Currency, Currency>, tokenIn: Token, amount: number) {
  const { calldata } = await SwapQuoter.quoteCallParameters(
    route,
    CurrencyAmount.fromRawAmount(
      tokenIn,
      amount
    ),
    TradeType.EXACT_INPUT,
    {
      useQuoterV2: true,
    }
  )

  const quoteCallReturnData = await provider.call({
    to: QUOTER_CONTRACT_ADDRESS,
    data: calldata,
  })

  return ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], quoteCallReturnData)
}

function fromReadableAmount(
  amount: number,
  decimals: number
): BigNumberish {
  console.log(`fromReadableAmount: ${amount}`)
  return ethers.parseUnits(amount.toString(), decimals)
}


main()