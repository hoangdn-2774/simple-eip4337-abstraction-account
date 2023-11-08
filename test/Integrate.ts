import { expect } from "chai";
import { ethers } from "hardhat";

describe("Simple abstraction account", function () {
  before(async function () {
    // prepare addresses
    this.signers = await ethers.getSigners();
    this.operator = this.signers[0];
    this.addr1 = this.signers[1];
    this.addr2 = this.signers[2];
    this.addr3 = this.signers[3];
    this.deployer = this.signers[4];
    this.inventory = this.signers[5];
    this.accountOwner = this.signers[6];

    // prepare contract factories
    this.TokenFactory = await ethers.getContractFactory("Token");
    this.AccountFactory = await ethers.getContractFactory("SimpleAccount");
    this.EntryPointFactory = await ethers.getContractFactory("EntryPoint");
    this.PayMasterFactory = await ethers.getContractFactory("PayMaster");

    // function to estimate a single user operation
    this.estimateOpGas = async (trans: any) => {
      // estimate in case uses max fund from paymaster
      const gasPrice = await this.operator.getGasPrice();
      trans[4] = (await ethers.provider.getBalance(this.paymaster.address)).sub(
        21000 * gasPrice
      );

      // estimate transaction fee
      const estimate = await this.entrypoint
        .connect(this.operator)
        .estimateGas.handleOp(trans);

      trans[4] = gasPrice.mul(estimate).toString();
      return trans;
    };
  });

  beforeEach(async function () {
    // deploy token
    this.token = await this.TokenFactory.connect(this.deployer).deploy(
      "TokenA",
      "TKA"
    );
    await this.token.deployed();

    // deploy entry point contract
    this.entrypoint = await this.EntryPointFactory.connect(
      this.deployer
    ).deploy();
    await this.entrypoint.deployed();
    // transfer ownership to redirect operation fee
    await this.entrypoint.transferOwnership(this.inventory.address);

    // deploy account contract
    this.account = await this.AccountFactory.connect(this.deployer).deploy(
      this.entrypoint.address
    );
    await this.account.deployed();
    await this.account
      .connect(this.deployer)
      .transferOwnership(this.accountOwner.address);

    // deploy paymaster contract
    this.paymaster = await this.PayMasterFactory.connect(
      this.deployer
    ).deploy();
    await this.paymaster.deployed();

    // set entrypoint in paymaster contract
    await this.paymaster.setEntryPoint(this.entrypoint.address);
  });

  describe("main flow", async function () {
    it("should allow owner to send ether", async function () {
      // deposit ether to account contract
      await this.addr1.sendTransaction({
        to: this.account.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // get target balance before sending
      const balanceBefore = await ethers.provider.getBalance(
        this.addr2.address
      );

      // execution
      await expect(
        this.account
          .connect(this.accountOwner)
          .execute(this.addr2.address, ethers.utils.parseEther("1.0"), "0x")
      ).to.be.not.reverted;

      // get target balance after execution
      const balanceAfter = await ethers.provider.getBalance(this.addr2.address);

      // expectation
      expect(balanceAfter).to.be.equal(
        balanceBefore.add(ethers.utils.parseEther("1.0"))
      );
    });
  });

  describe("entry point", async function () {
    it("should allow entrypoint to send ether", async function () {
      // deposit ether to account contract
      await this.addr1.sendTransaction({
        to: this.account.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // deposit ether to paymaster
      await this.addr1.sendTransaction({
        to: this.paymaster.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // prepare data to pass to account contract
      const data = this.account.interface.encodeFunctionData("execute", [
        this.addr2.address,
        ethers.utils.parseEther("0.5"),
        "0x",
      ]);

      // create signature
      const hash = await this.entrypoint.getMessageHash(
        this.accountOwner.address,
        1
      );

      const hashInBytes = ethers.utils.arrayify(hash);
      const signature = await this.accountOwner.signMessage(hashInBytes);

      // prepare data to transfer ether from account to addr2
      const transactionData = [
        [this.account.address, 1, data, this.paymaster.address, 0, signature],
      ];
      transactionData[0] = await this.estimateOpGas(transactionData[0]);

      // store pre-values
      const preTargetBalance = await ethers.provider.getBalance(
        this.addr2.address
      );
      const preOperatorBalance = await ethers.provider.getBalance(
        this.operator.address
      );

      // execute
      await expect(
        this.entrypoint.connect(this.operator).handleOps(transactionData)
      ).to.be.not.reverted;

      // check balance
      const actTargetBalance = await ethers.provider.getBalance(
        this.addr2.address
      );
      const actAccountBalance = await ethers.provider.getBalance(
        this.account.address
      );
      const actOperatorBalance = await ethers.provider.getBalance(
        this.operator.address
      );

      // expectations
      expect(actTargetBalance).to.be.equal(
        preTargetBalance.add(ethers.utils.parseEther("0.5"))
      );
      expect(actAccountBalance).to.be.equal(ethers.utils.parseEther("0.5"));
      expect(actOperatorBalance.sub(preOperatorBalance)).to.be.greaterThan(
        ethers.BigNumber.from(0)
      );
    });

    it("should allow entrypoint to send ether to multiple targets", async function () {
      // deposit ether to account contract
      await this.addr1.sendTransaction({
        to: this.account.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // deposit ether to paymaster
      await this.addr1.sendTransaction({
        to: this.paymaster.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // prepare data to pass to account contract
      const data1 = this.account.interface.encodeFunctionData("execute", [
        this.addr2.address,
        ethers.utils.parseEther("0.5"),
        "0x",
      ]);
      const data2 = this.account.interface.encodeFunctionData("execute", [
        this.addr3.address,
        ethers.utils.parseEther("0.5"),
        "0x",
      ]);

      // create signatures
      const hash1 = await this.entrypoint.getMessageHash(
        this.accountOwner.address,
        1
      );
      const hash2 = await this.entrypoint.getMessageHash(
        this.accountOwner.address,
        2
      );

      const hashInBytes1 = ethers.utils.arrayify(hash1);
      const hashInBytes2 = ethers.utils.arrayify(hash2);
      const signature1 = await this.accountOwner.signMessage(hashInBytes1);
      const signature2 = await this.accountOwner.signMessage(hashInBytes2);

      // prepare data to transfer ether from account to addr2, addr3
      const transactionData = [
        [this.account.address, 1, data1, this.paymaster.address, 0, signature1],
        [this.account.address, 2, data2, this.paymaster.address, 0, signature2],
      ];
      transactionData[0] = await this.estimateOpGas(transactionData[0]);
      transactionData[1] = await this.estimateOpGas(transactionData[1]);

      // store pre-values
      const preTarget1Balance = await ethers.provider.getBalance(
        this.addr2.address
      );
      const preTarget2Balance = await ethers.provider.getBalance(
        this.addr3.address
      );
      const preOperatorBalance = await ethers.provider.getBalance(
        this.operator.address
      );

      // execute
      await expect(
        this.entrypoint.connect(this.operator).handleOps(transactionData)
      ).to.be.not.reverted;

      // check balance
      const actTarget1Balance = await ethers.provider.getBalance(
        this.addr2.address
      );
      const actTarget2Balance = await ethers.provider.getBalance(
        this.addr3.address
      );
      const actAccountBalance = await ethers.provider.getBalance(
        this.account.address
      );
      const actOperatorBalance = await ethers.provider.getBalance(
        this.operator.address
      );

      // expectations
      expect(actTarget1Balance).to.be.equal(
        preTarget1Balance.add(ethers.utils.parseEther("0.5"))
      );
      expect(actTarget2Balance).to.be.equal(
        preTarget2Balance.add(ethers.utils.parseEther("0.5"))
      );
      expect(actAccountBalance).to.be.equal(ethers.BigNumber.from(0));
      expect(actOperatorBalance.sub(preOperatorBalance)).to.be.greaterThan(
        ethers.BigNumber.from(0)
      );
    });

    it("should allow entrypoint to send token", async function () {
      // deposit token to account contract
      await this.token
        .connect(this.deployer)
        .transfer(this.account.address, 1000000);

      // deposit ether to paymaster
      await this.deployer.sendTransaction({
        to: this.paymaster.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // prepare data to transfer token
      const transferData = this.token.interface.encodeFunctionData("transfer", [
        this.addr2.address,
        500,
      ]);

      // prepare data to pass to account contract
      const data = this.account.interface.encodeFunctionData("execute", [
        this.token.address,
        0,
        transferData,
      ]);

      // create signature
      const hash = await this.entrypoint.getMessageHash(
        this.accountOwner.address,
        1
      );

      const hashInBytes = ethers.utils.arrayify(hash);
      const signature = await this.accountOwner.signMessage(hashInBytes);

      // prepare data to transfer ether from account to addr2
      const transactionData = [
        [this.account.address, 1, data, this.paymaster.address, 0, signature],
      ];
      transactionData[0] = await this.estimateOpGas(transactionData[0]);

      // execute
      await expect(
        this.entrypoint.connect(this.operator).handleOps(transactionData)
      ).to.be.not.reverted;

      // check balance
      const actTargetBalance = await this.token.balanceOf(this.addr2.address);
      const actAccountBalance = await this.token.balanceOf(
        this.account.address
      );

      // expectations
      expect(actTargetBalance).to.be.equal(ethers.BigNumber.from(500));
      expect(actAccountBalance).to.be.equal(ethers.BigNumber.from(999500));
    });

    it("should allow entrypoint to send both token and ether", async function () {
      // deposit token to account contract
      await this.token
        .connect(this.deployer)
        .transfer(this.account.address, 1000000);

      // deposit ether to account contract
      await this.deployer.sendTransaction({
        to: this.account.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // deposit ether to paymaster
      await this.deployer.sendTransaction({
        to: this.paymaster.address,
        value: ethers.utils.parseEther("1.0"),
      });

      // prepare data to transfer token
      const transferData = this.token.interface.encodeFunctionData("transfer", [
        this.addr2.address,
        500,
      ]);

      // prepare data to pass to account contract - to send token
      const dataToken = this.account.interface.encodeFunctionData("execute", [
        this.token.address,
        0,
        transferData,
      ]);

      // prepare data to pass to account contract - to send ether
      const dataEther = this.account.interface.encodeFunctionData("execute", [
        this.addr2.address,
        ethers.utils.parseEther("0.5"),
        "0x",
      ]);

      // create signatures
      const hash1 = await this.entrypoint.getMessageHash(
        this.accountOwner.address,
        1
      );
      const hash2 = await this.entrypoint.getMessageHash(
        this.accountOwner.address,
        2
      );

      const hashInBytes1 = ethers.utils.arrayify(hash1);
      const hashInBytes2 = ethers.utils.arrayify(hash2);
      const signature1 = await this.accountOwner.signMessage(hashInBytes1);
      const signature2 = await this.accountOwner.signMessage(hashInBytes2);

      // prepare data to transfer ether from account to addr2
      const transactionData = [
        [
          this.account.address,
          1,
          dataToken,
          this.paymaster.address,
          0,
          signature1,
        ],
        [
          this.account.address,
          2,
          dataEther,
          this.paymaster.address,
          0,
          signature2,
        ],
      ];
      transactionData[0] = await this.estimateOpGas(transactionData[0]);
      transactionData[1] = await this.estimateOpGas(transactionData[1]);

      // store pre-values
      const preTargetEtherBalance = await ethers.provider.getBalance(
        this.addr2.address
      );
      const preInventoryBalance = await ethers.provider.getBalance(
        this.inventory.address
      );

      // execute
      await expect(
        this.entrypoint.connect(this.operator).handleOps(transactionData)
      ).to.be.not.reverted;

      // check token balance
      const actTargetTokenBalance = await this.token.balanceOf(
        this.addr2.address
      );
      const actAccountTokenBalance = await this.token.balanceOf(
        this.account.address
      );

      // check ether balance
      const actTargetEtherBalance = await ethers.provider.getBalance(
        this.addr2.address
      );
      const actInventoryBalance = await ethers.provider.getBalance(
        this.inventory.address
      );

      // expectations
      expect(actTargetTokenBalance).to.be.equal(ethers.BigNumber.from(500));
      expect(actAccountTokenBalance).to.be.equal(ethers.BigNumber.from(999500));
      expect(actTargetEtherBalance).to.be.equal(
        preTargetEtherBalance.add(ethers.utils.parseEther("0.5"))
      );
      expect(actInventoryBalance).to.be.equal(
        preInventoryBalance.add(ethers.BigNumber.from(2000))
      );
    });
  });
});
