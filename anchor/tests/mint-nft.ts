import * as anchor from '@coral-xyz/anchor';
import type { Program } from '@coral-xyz/anchor';
import type NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createInitializeMintInstruction } from '@solana/spl-token';
import { SystemProgram, Keypair } from '@solana/web3.js';
import type { MintNft } from '../target/types/mint_nft';

import { 
  CreateCollectionAccounts, 
  MintNFTAccounts, 
  ListNftAccounts, 
  MarketplaceAccounts, 
  VerifyCollectionAccounts, 
  NFTMetadata,
  getMetadata,
  getMasterEdition 
} from './types/utils';
import { createAssociatedTokenAccountInstruction } from '@solana/spl-token';

describe('NFT Marketplace Tests', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as NodeWallet;
  const program = anchor.workspace.MintNft as Program<MintNft>;

  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  
  const [mintAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('authority')],
    program.programId
  );

  let collectionKeypair: Keypair;
  let collectionMint: anchor.web3.PublicKey;
  let mintKeypair: Keypair;
  let mint: anchor.web3.PublicKey;
  let userNftAccount: anchor.web3.PublicKey;

  beforeEach(async () => {
    // Tạo keypair mới cho mỗi test case
    collectionKeypair = Keypair.generate();
    collectionMint = collectionKeypair.publicKey;
    mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;
  });

  describe('Collection Flow', () => {
    it("Bước 1: Tạo collection", async () => {
      try {
        console.log("\n=== TẠO COLLECTION ===");
        const metadata = await getMetadata(collectionMint);
        const masterEdition = await getMasterEdition(collectionMint);
        const destination = getAssociatedTokenAddressSync(collectionMint, wallet.publicKey);

        console.log("Collection Mint:", collectionMint.toBase58());
        console.log("Collection Metadata:", metadata.toBase58());
        console.log("Collection Master Edition:", masterEdition.toBase58());

        const collectionMetadata: NFTMetadata = {
          name: "Test Collection",
          symbol: "TCOL",
          uri: "https://gateway.pinata.cloud/ipfs/QmWPf3yr7JR7PEQnibJTEMib7jzMoYWacNPcyK6JZJTGPp",
          sellerFeeBasisPoints: 500,
          creators: [{
            address: wallet.publicKey,
            verified: false,
            share: 100
          }]
        };

        const tx = await program.methods
          .createCollection(collectionMetadata)
          .accounts({
            user: wallet.publicKey,
            mint: collectionMint,
            mintAuthority,
            metadata,
            masterEdition,
            destination,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY
          } as CreateCollectionAccounts)
          .signers([collectionKeypair])
          .rpc();

        console.log("✅ Collection created:", tx);
      } catch (error) {
        console.error("\n❌ LỖI KHI TẠO COLLECTION:");
        logError(error);
        throw error;
      }
    });

    it("Bước 2: Khởi tạo mint account", async () => {
      try {
        console.log("\n=== KHỞI TẠO MINT ACCOUNT ===");
        
        const createAccountIx = SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mint,
          space: 82,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
          programId: TOKEN_PROGRAM_ID
        });

        const initializeMintIx = createInitializeMintInstruction(
          mint,
          0,
          mintAuthority,
          mintAuthority
        );

        const tx = await provider.sendAndConfirm(
          new anchor.web3.Transaction()
            .add(createAccountIx)
            .add(initializeMintIx),
          [mintKeypair]
        );

        console.log("✅ Mint account initialized:", tx);
      } catch (error) {
        console.error("\n❌ LỖI KHI KHỞI TẠO MINT:");
        logError(error);
        throw error;
      }
    });

    it("Bước 3: Mint NFT vào collection", async () => {
      try {
        console.log("\n=== MINT NFT ===");
        
        // Khởi tạo collection_mint trước
        const collectionMintTx = new anchor.web3.Transaction();
        collectionMintTx.add(
          SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: collectionMint,
            space: 82,
            lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
            programId: TOKEN_PROGRAM_ID
          }),
          createInitializeMintInstruction(
            collectionMint,
            0,
            mintAuthority,
            mintAuthority
          )
        );

        await provider.sendAndConfirm(collectionMintTx, [collectionKeypair]);

        // Tiếp tục mint NFT như cũ
        const metadata = await getMetadata(mint);
        const masterEdition = await getMasterEdition(mint);
        const destination = getAssociatedTokenAddressSync(mint, wallet.publicKey);

        console.log("NFT Mint:", mint.toBase58());
        console.log("Collection Mint:", collectionMint.toBase58());
        console.log("NFT Metadata:", metadata.toBase58());
        console.log("NFT Master Edition:", masterEdition.toBase58());
        console.log("Destination (ATA):", destination.toBase58());

        const nftMetadata: NFTMetadata = {
          name: "Test NFT",
          symbol: "TNFT",
          uri: "https://gateway.pinata.cloud/ipfs/Qma5HmqRjqKUNcKWu6QP7BbeAnvfCujVQs7ERGvbVBRLZ2",
          sellerFeeBasisPoints: 500,
          creators: [{
            address: wallet.publicKey,
            verified: false,
            share: 100
          }]
        };

        const tx = await program.methods
          .mintNft(nftMetadata)
          .accounts({
            owner: wallet.publicKey,
            mint,
            mintAuthority,
            metadata,
            masterEdition,
            destination,
            collectionMint,
            collectionMetadata: await getMetadata(collectionMint),
            collectionMasterEdition: await getMasterEdition(collectionMint),
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY
          } as MintNFTAccounts)
          .signers([mintKeypair])
          .rpc();

        console.log("✅ NFT minted:", tx);
      } catch (error) {
        console.error("\n❌ LỖI KHI MINT NFT:");
        logError(error);
        throw error;
      }
    });

    /* Tạm comment bước 4
    it("Bước 4: Verify collection", async () => {
      try {
        console.log("\n=== VERIFY COLLECTION ===");
        
        // Lấy các địa chỉ metadata cần thiết
        const metadata = await getMetadata(mint);
        const collectionMetadata = await getMetadata(collectionMint);
        const collectionMasterEdition = await getMasterEdition(collectionMint);

        console.log("NFT Mint:", mint.toBase58());
        console.log("NFT Metadata:", metadata.toBase58());
        console.log("Collection Mint:", collectionMint.toBase58());
        console.log("Collection Metadata:", collectionMetadata.toBase58());
        console.log("Collection Master Edition:", collectionMasterEdition.toBase58());

        // Lấy seeds và bump cho PDA
        const seeds = [Buffer.from('authority')];
        const [authority] = anchor.web3.PublicKey.findProgramAddressSync(
          seeds,
          program.programId
        );

        const tx = await program.methods
          .verifyCollection()
          .accounts({
            authority: wallet.publicKey, // Sử dụng wallet làm authority
            metadata,
            mint,
            mintAuthority: authority, // Sử dụng PDA làm mint authority
            collectionMint,
            collectionMetadata,
            collectionMasterEdition,
            systemProgram: SystemProgram.programId,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            sysvarInstruction: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY
          } as VerifyCollectionAccounts)
          .signers([]) // Không cần thêm signer vì wallet.publicKey đã là signer mặc định
          .rpc();

        console.log("✅ Collection verified:", tx);
      } catch (error) {
        console.error("\n❌ LỖI KHI VERIFY COLLECTION:");
        logError(error);
        throw error;
      }
    });
    */
  });

  function logError(error: any) {
    console.error("- Loại lỗi:", error.name);
    console.error("- Message:", error.message);
    if (error.logs) {
      console.error("\nProgram Logs:");
      error.logs.forEach((log: string) => console.error(log));
    }
  }
});
