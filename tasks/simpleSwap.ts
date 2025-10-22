import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const DECIMALS = 1_000_000n;

function parseAmount(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error(`Value '${value}' must have at most 6 decimal places`);
  }

  const [integerPart, fractionalPart = ""] = trimmed.split(".");
  const paddedFraction = (fractionalPart + "000000").slice(0, 6);

  return BigInt(integerPart) * DECIMALS + BigInt(paddedFraction);
}

function ensureSafeNumber(amount: bigint): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Value ${amount} exceeds supported range`);
  }
  return Number(amount);
}

task("task:addresses", "Prints deployed contract addresses").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const mockEth = await deployments.get("MockETH");
  const mockZama = await deployments.get("MockZama");
  const simpleSwap = await deployments.get("SimpleSwap");

  console.log(`MockETH address: ${mockEth.address}`);
  console.log(`MockZama address: ${mockZama.address}`);
  console.log(`SimpleSwap address: ${simpleSwap.address}`);
});

task("task:price", "Reads the SimpleSwap price")
  .addOptionalParam("address", "SimpleSwap contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await deployments.get("SimpleSwap");

    const contract = await ethers.getContractAt("SimpleSwap", deployment.address);
    const value = await contract.price();

    console.log(`Current price (Zama per 1 mockETH): ${value.toString()}`);
  });

task("task:set-price", "Updates the SimpleSwap price")
  .addParam("value", "Price as Zama tokens per 1 mockETH")
  .addOptionalParam("address", "SimpleSwap contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;

    const newPrice = BigInt(taskArguments.value as string);
    if (newPrice <= 0) {
      throw new Error("Price must be greater than zero");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await deployments.get("SimpleSwap");

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("SimpleSwap", deployment.address);

    const tx = await contract.connect(signer).setPrice(newPrice);
    console.log(`Updating price to ${newPrice.toString()}... tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Price update completed with status: ${receipt?.status}`);
  });

task("task:swap-eth-for-zama", "Swaps mockETH for mockZama")
  .addParam("value", "Amount of mockETH to swap (supports up to 6 decimals, e.g. 1.5)")
  .addOptionalParam("address", "SimpleSwap contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    const amount = parseAmount(taskArguments.value as string);

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await deployments.get("SimpleSwap");

    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("SimpleSwap", deployment.address);

    const encryptedInput = await fhevm.encryptUint(
      FhevmType.euint64,
      ensureSafeNumber(amount),
      deployment.address,
      signer.address,
    );

    const tx = await contract
      .connect(signer)
      .swapEthForZama(encryptedInput.externalEuint, encryptedInput.inputProof);

    console.log(`Swapping ${taskArguments.value} mockETH... tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Swap completed with status: ${receipt?.status}`);
  });

task("task:swap-zama-for-eth", "Swaps mockZama for mockETH")
  .addParam("value", "Amount of mockZama to swap (supports up to 6 decimals, e.g. 100.25)")
  .addOptionalParam("address", "SimpleSwap contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    const amount = parseAmount(taskArguments.value as string);

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await deployments.get("SimpleSwap");

    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("SimpleSwap", deployment.address);

    const encryptedInput = await fhevm.encryptUint(
      FhevmType.euint64,
      ensureSafeNumber(amount),
      deployment.address,
      signer.address,
    );

    const tx = await contract
      .connect(signer)
      .swapZamaForEth(encryptedInput.externalEuint, encryptedInput.inputProof);

    console.log(`Swapping ${taskArguments.value} mockZama... tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Swap completed with status: ${receipt?.status}`);
  });
