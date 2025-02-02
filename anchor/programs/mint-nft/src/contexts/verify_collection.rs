use anchor_lang::prelude::*;

use anchor_spl::metadata::mpl_token_metadata::instructions::{
    VerifyCollectionV1Cpi,
    VerifyCollectionV1CpiAccounts,
};

use anchor_spl::{
    token::Mint, 
    metadata::Metadata, 
};
use crate::errors::NFTError;
pub use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;



#[derive(Accounts)]
pub struct VerifyCollectionMint<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub metadata: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        seeds = [b"authority"],
        bump,
    )]
    /// CHECK: This account is not initialized and is being used for signing purposes only
    pub mint_authority: UncheckedAccount<'info>,
    pub collection_mint: Account<'info, Mint>,
    #[account(mut)]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub collection_metadata: UncheckedAccount<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub collection_master_edition: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub sysvar_instruction: UncheckedAccount<'info>,
    pub token_metadata_program: Program<'info, Metadata>,
}

impl<'info> VerifyCollectionMint<'info> {
    pub fn verify_collection(&mut self) -> Result<()> {
        // Validate authority
        require!(
            self.authority.key() == self.mint_authority.key(),
            NFTError::InvalidAuthority
        );

        let metadata = &self.metadata.to_account_info();
        let authority = &self.mint_authority.to_account_info();
        let collection_mint = &self.collection_mint.to_account_info();
        let collection_metadata = &self.collection_metadata.to_account_info();
        let collection_master_edition = &self.collection_master_edition.to_account_info();
        let system_program = &self.system_program.to_account_info();
        let sysvar_instructions = &self.sysvar_instruction.to_account_info();
        let spl_metadata_program = &self.token_metadata_program.to_account_info();

        let seeds = &[
            &b"authority"[..], 
        ];
        let signer_seeds = &[&seeds[..]];

        let verify_collection = VerifyCollectionV1Cpi::new(
            spl_metadata_program,
            VerifyCollectionV1CpiAccounts {
                authority,
                delegate_record: None,
                metadata,
                collection_mint,
                collection_metadata: Some(collection_metadata),
                collection_master_edition: Some(collection_master_edition),
                system_program,
                sysvar_instructions,
            }
        );
        verify_collection.invoke_signed(signer_seeds)?;

        msg!("Collection Verified!");
        
        Ok(())
    }
}