//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract SimpleAccount is Ownable(msg.sender) {
    address public entryAddr;
    mapping(address => bool) public recoveryAddrs;
    uint256 public minSigners = 2;

    constructor(address entryPoint, address[] memory rcAddrs, uint256 minAddr) {
        entryAddr = entryPoint;
        minSigners = minAddr;
        for (uint256 ind = 0; ind < rcAddrs.length; ind++) {
            recoveryAddrs[rcAddrs[ind]] = true;
        }
    }

    modifier onlyOwnerOrEntryPoint() {
        require(
            msg.sender == owner() || msg.sender == entryAddr,
            "AA: must be called from owner or entrypoint"
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

    function setRecoveryAddr(
        address _rcAddr,
        bool _isAllowed
    ) external onlyOwner {
        recoveryAddrs[_rcAddr] = _isAllowed;
    }

    function recover(address _newOwner) external {
        require(msg.sender == entryAddr, "AA: must be called from entrypoint");
        super._transferOwnership(_newOwner);
    }
}
