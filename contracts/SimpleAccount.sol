//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract SimpleAccount is Ownable(msg.sender) {
    address public entryAddr;

    constructor(address entryPoint) {
        entryAddr = entryPoint;
    }

    modifier onlyOwnerOrEntryPoint() {
        require(
            msg.sender == owner() || msg.sender == entryAddr,
            "must be called from owner or entry point"
        );
        _;
    }

    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external onlyOwnerOrEntryPoint {
        _call(dest, value, func);
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    receive() external payable {}

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
