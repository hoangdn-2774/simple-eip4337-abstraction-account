//SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Token is ERC20, Ownable(msg.sender) {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 10 ** 9 * 10 ** decimals());
    }

    /**
     * @dev Mint new token
     * @notice only contract owner can call this function
     * @param amount    amount of new token to be minted
     */
    function mint(uint256 amount) public onlyOwner {
        // validate mint amount
        require(amount > 0, "Zero amount");

        // mint and send to caller - contract owner
        _mint(msg.sender, amount);
    }
}
