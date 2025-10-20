// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract MockETH is ERC7984, SepoliaConfig {
    constructor() ERC7984("mockETH", "mockETH", "") {}

    function mint() external {
        uint64 amount = 1*1000000;
        euint64 encryptedAmount = FHE.asEuint64(amount);
        _mint(msg.sender, encryptedAmount);
    }
}
