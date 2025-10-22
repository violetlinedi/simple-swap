import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const mockEth = await deploy("MockETH", {
    from: deployer,
    log: true,
  });

  const mockZama = await deploy("MockZama", {
    from: deployer,
    log: true,
  });

  const simpleSwap = await deploy("SimpleSwap", {
    from: deployer,
    log: true,
    args: [mockEth.address, mockZama.address, 1000],
  });

  console.log(`MockETH contract: ${mockEth.address}`);
  console.log(`MockZama contract: ${mockZama.address}`);
  console.log(`SimpleSwap contract: ${simpleSwap.address}`);
};
export default func;
func.id = "deploy_simple_swap"; // id required to prevent reexecution
func.tags = ["SimpleSwap"];
