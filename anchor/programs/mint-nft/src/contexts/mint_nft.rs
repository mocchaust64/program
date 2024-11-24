use anchor_lang::prelude::*;
use crate::contexts::metadata::Creator;
use anchor_spl::{
    associated_token::AssociatedToken, 
    metadata::Metadata, 
    token::{Mint, Token, TokenAccount}
};
use anchor_spl::metadata::mpl_token_metadata::instructions::{
    CreateMetadataAccountV3Cpi,
    CreateMetadataAccountV3CpiAccounts,
    CreateMetadataAccountV3InstructionArgs,
};
use anchor_spl::metadata::mpl_token_metadata::types::DataV2;
use crate::errors::NFTError;
use crate::contexts::metadata::NFTMetadata;



#[derive(Accounts)]
#[instruction(nft_metadata: NFTMetadata)]
pub struct MintNFT<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(mut)]
    pub mint: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = owner
    )]
    pub destination: Account<'info, TokenAccount>,
    
    #[account(mut)]
    /// CHECK: This account will be initialized by the metaplex program
    pub metadata: UncheckedAccount<'info>,
    
    #[account(mut)]
    /// CHECK: This account will be initialized by the metaplex program
    pub master_edition: UncheckedAccount<'info>,
    
    #[account(
        seeds = [b"authority"],
        bump,
    )]
    /// CHECK: PDA used as mint authority
    pub mint_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub collection_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    /// CHECK: This is not dangerous because we just read from this account
    pub rent: Sysvar<'info, Rent>,
}



impl<'info> MintNFT<'info> {
    pub fn mint_nft(&mut self, nft_metadata: NFTMetadata, bumps: &MintNFTBumps) -> Result<()> {
        let mint_authority_seeds = &[
            b"authority".as_ref(),
            &[bumps.mint_authority]
        ];
        let mint_authority_signer = &[&mint_authority_seeds[..]];

        // 1. Mint token
        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: self.mint.to_account_info(),
                    to: self.destination.to_account_info(),
                    authority: self.mint_authority.to_account_info(),
                },
                mint_authority_signer
            ),
            1,
        )?;

        // 2. Create metadata (giữ nguyên phần code cũ)
        let creators = nft_metadata.creators.clone();
        require!(
            creators.iter().map(|c| c.share).sum::<u8>() == 100,
            NFTError::InvalidMetadata
        );

        // Tạo metadata account như code cũ
        let token_metadata_info = self.token_metadata_program.to_account_info();
        let metadata_info = self.metadata.to_account_info();
        let mint_authority_info = self.mint_authority.to_account_info();
        let mint_info = self.mint.to_account_info();
        let owner_info = self.owner.to_account_info();
        let system_program_info = self.system_program.to_account_info();
        let rent_info = self.rent.to_account_info();

        let metadata_account = CreateMetadataAccountV3Cpi::new(
            &token_metadata_info,
            CreateMetadataAccountV3CpiAccounts {
                metadata: &metadata_info,
                mint: &mint_info,
                mint_authority: &mint_authority_info,
                payer: &owner_info,
                update_authority: (&mint_authority_info, true),
                system_program: &system_program_info,
                rent: Some(&rent_info),
            },
            CreateMetadataAccountV3InstructionArgs {
                data: DataV2 {
                    name: nft_metadata.name,
                    symbol: nft_metadata.symbol,
                    uri: nft_metadata.uri,
                    seller_fee_basis_points: nft_metadata.seller_fee_basis_points,
                    creators: Some(Creator::to_metaplex_creators(creators)),
                    collection: None,
                    uses: None,
                },
                is_mutable: true,
                collection_details: None,
            },
        );
        metadata_account.invoke()?;

        Ok(())
    }
}