//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PayMaster is Ownable(msg.sender) {
    address public entryPointAddr;

    receive() external payable {}

    modifier onlyEntryPoint() {
        require(
            msg.sender == entryPointAddr,
            "PayMaster: not called from EntryPoint"
        );
        _;
    }

    function setEntryPoint(address _entryPoint) external onlyOwner {
        entryPointAddr = _entryPoint;
    }

    function pay(
        address[] calldata targets,
        uint256[] calldata amounts
    ) external onlyEntryPoint {
        for (uint8 ind = 0; ind < targets.length; ind++) {
            (bool isSent, ) = payable(targets[ind]).call{value: amounts[ind]}(
                ""
            );
            require(isSent == true, "Unable to pay fee");
        }
    }
}
