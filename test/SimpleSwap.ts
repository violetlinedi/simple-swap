import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  MockETH,
  MockETH__factory,
  MockZama,
  MockZama__factory,
  SimpleSwap,
  SimpleSwap__factory,
} from "../types";

type Signers = {
  owner: HardhatEthersSigner;
  trader: HardhatEthersSigner;
  stranger: HardhatEthersSigner;
};

const PRICE = 1000n;
const TOKEN_SCALE = 1_000_000n;

function ensureSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Value ${value} exceeds MAX_SAFE_INTEGER`);
  }
  return Number(value);
}

async function encryptAmount(
  contractAddress: string,
  signer: HardhatEthersSigner,
  amount: bigint,
) {
  const input = await fhevm.createEncryptedInput(contractAddress, signer.address);
  input.add64(ensureSafeNumber(amount));
  return input.encrypt();
}

async function deployFixture() {
  const mockEthFactory = (await ethers.getContractFactory("MockETH")) as MockETH__factory;
  const mockZamaFactory = (await ethers.getContractFactory("MockZama")) as MockZama__factory;
  const simpleSwapFactory = (await ethers.getContractFactory("SimpleSwap")) as SimpleSwap__factory;

  const mockEth = (await mockEthFactory.deploy()) as MockETH;
  const mockZama = (await mockZamaFactory.deploy()) as MockZama;

  const mockEthAddress = await mockEth.getAddress();
  const mockZamaAddress = await mockZama.getAddress();

  const simpleSwap = (await simpleSwapFactory.deploy(mockEthAddress, mockZamaAddress, PRICE)) as SimpleSwap;
  const simpleSwapAddress = await simpleSwap.getAddress();

  return { mockEth, mockZama, simpleSwap, mockEthAddress, mockZamaAddress, simpleSwapAddress };
}

describe("SimpleSwap", function () {
  let signers: Signers;
  let mockEth: MockETH;
  let mockZama: MockZama;
  let simpleSwap: SimpleSwap;
  let mockEthAddress: string;
  let mockZamaAddress: string;
  let simpleSwapAddress: string;

  before(async function () {
    const allSigners = await ethers.getSigners();
    signers = {
      owner: allSigners[0],
      trader: allSigners[1],
      stranger: allSigners[2],
    };

    if (!fhevm.isMock) {
      this.skip();
    }

    await fhevm.initializeCLIApi();
  });

  beforeEach(async function () {
    ({ mockEth, mockZama, simpleSwap, mockEthAddress, mockZamaAddress, simpleSwapAddress } = await deployFixture());

    // Provide liquidity to the swap contract
    await mockEth.connect(signers.owner).mint();
    await mockZama.connect(signers.owner).mint();

    const ethLiquidity = await encryptAmount(mockEthAddress, signers.owner, 1n * TOKEN_SCALE);
    await (
      await mockEth
        .connect(signers.owner)
        ['confidentialTransfer(address,bytes32,bytes)'](
          simpleSwapAddress,
          ethLiquidity.handles[0],
          ethLiquidity.inputProof,
        )
    ).wait();

    const zamaLiquidity = await encryptAmount(mockZamaAddress, signers.owner, 1000n * TOKEN_SCALE);
    await (
      await mockZama
        .connect(signers.owner)
        ['confidentialTransfer(address,bytes32,bytes)'](
          simpleSwapAddress,
          zamaLiquidity.handles[0],
          zamaLiquidity.inputProof,
        )
    ).wait();
  });

  it("stores the initial price", async function () {
    const storedPrice = await simpleSwap.price();
    expect(storedPrice).to.equal(PRICE);
  });

  it("allows only the owner to update the price", async function () {
    await expect(simpleSwap.connect(signers.trader).setPrice(1200)).to.be.revertedWithCustomError(
      simpleSwap,
      "Unauthorized",
    );

    await (await simpleSwap.connect(signers.owner).setPrice(1500)).wait();
    const storedPrice = await simpleSwap.price();
    expect(storedPrice).to.equal(1500);
  });

  it("swaps mockETH for mockZama at the fixed price", async function () {
    await mockEth.connect(signers.trader).mint();

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    await (await mockEth.connect(signers.trader).setOperator(simpleSwapAddress, expiry)).wait();

    const encryptedAmount = await encryptAmount(simpleSwapAddress, signers.trader, 1n * TOKEN_SCALE);

    await (await simpleSwap
      .connect(signers.trader)
      .swapEthForZama(encryptedAmount.handles[0], encryptedAmount.inputProof)).wait();

    const encryptedEthBalance = await mockEth.confidentialBalanceOf(signers.trader.address);
    const traderEth = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedEthBalance,
      mockEthAddress,
      signers.trader,
    );

    const encryptedZamaBalance = await mockZama.confidentialBalanceOf(signers.trader.address);
    const traderZama = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedZamaBalance,
      mockZamaAddress,
      signers.trader,
    );

    expect(traderEth).to.equal(0n);
    expect(traderZama).to.equal(1000n * TOKEN_SCALE);
  });

  it("swaps mockZama for mockETH at the fixed price", async function () {
    await mockZama.connect(signers.trader).mint();

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    await (await mockZama.connect(signers.trader).setOperator(simpleSwapAddress, expiry)).wait();

    const encryptedAmount = await encryptAmount(simpleSwapAddress, signers.trader, 500n * TOKEN_SCALE);

    await (await simpleSwap
      .connect(signers.trader)
      .swapZamaForEth(encryptedAmount.handles[0], encryptedAmount.inputProof)).wait();

    const encryptedZamaBalance = await mockZama.confidentialBalanceOf(signers.trader.address);
    const traderZama = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedZamaBalance,
      mockZamaAddress,
      signers.trader,
    );

    const encryptedEthBalance = await mockEth.confidentialBalanceOf(signers.trader.address);
    const traderEth = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedEthBalance,
      mockEthAddress,
      signers.trader,
    );

    expect(traderZama).to.equal(500n * TOKEN_SCALE);
    expect(traderEth).to.equal(500_000n);
  });
});
