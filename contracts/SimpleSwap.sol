// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, externalEuint64, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {MockETH} from "./mockETH.sol";
import {MockZama} from "./mockZama.sol";

contract SimpleSwap is SepoliaConfig {
    error InvalidAddress();
    error InvalidPrice();
    error Unauthorized();

    event PriceUpdated(address indexed updater, uint64 newPrice);
    event SwapEthForZama(address indexed account, euint64 ethAmount, euint64 zamaAmount);
    event SwapZamaForEth(address indexed account, euint64 zamaAmount, euint64 ethAmount);

    MockETH public immutable mockEth;
    MockZama public immutable mockZama;
    address public immutable owner;

    uint64 private _price; // Zama tokens (6 decimals) per 1 mockETH token

    constructor(address mockEthAddress, address mockZamaAddress, uint64 initialPrice) {
        if (mockEthAddress == address(0) || mockZamaAddress == address(0)) {
            revert InvalidAddress();
        }
        if (initialPrice == 0) {
            revert InvalidPrice();
        }

        mockEth = MockETH(mockEthAddress);
        mockZama = MockZama(mockZamaAddress);
        owner = msg.sender;
        _price = initialPrice;

        emit PriceUpdated(msg.sender, initialPrice);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    function price() external view returns (uint64) {
        return _price;
    }

    function setPrice(uint64 newPrice) external onlyOwner {
        if (newPrice == 0) {
            revert InvalidPrice();
        }

        _price = newPrice;
        emit PriceUpdated(msg.sender, newPrice);
    }

    function swapEthForZama(externalEuint64 amount, bytes calldata inputProof) external returns (euint64) {
        euint64 ethAmount = FHE.fromExternal(amount, inputProof);
        FHE.allowThis(ethAmount);
        FHE.allow(ethAmount, address(mockEth));

        euint64 transferredEth = mockEth.confidentialTransferFrom(msg.sender, address(this), ethAmount);

        euint64 zamaAmount = FHE.mul(transferredEth, _price);
        FHE.allowThis(zamaAmount);
        FHE.allow(zamaAmount, address(mockZama));

        euint64 transferredZama = mockZama.confidentialTransfer(msg.sender, zamaAmount);

        emit SwapEthForZama(msg.sender, transferredEth, transferredZama);
        return transferredZama;
    }

    function swapZamaForEth(externalEuint64 amount, bytes calldata inputProof) external returns (euint64) {
        euint64 zamaAmount = FHE.fromExternal(amount, inputProof);
        FHE.allowThis(zamaAmount);
        FHE.allow(zamaAmount, address(mockZama));

        euint64 transferredZama = mockZama.confidentialTransferFrom(msg.sender, address(this), zamaAmount);

        euint64 ethAmount = FHE.div(transferredZama, _price);
        FHE.allowThis(ethAmount);
        FHE.allow(ethAmount, address(mockEth));

        euint64 transferredEth = mockEth.confidentialTransfer(msg.sender, ethAmount);

        emit SwapZamaForEth(msg.sender, transferredZama, transferredEth);
        return transferredEth;
    }
}
