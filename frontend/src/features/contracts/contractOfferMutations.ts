import { gql } from '@apollo/client'

export const CREATE_OFFER_MUTATION = gql`
  mutation CreateOffer($contractId: Int!, $billingDate: Date!) {
    createOffer(contractId: $contractId, billingDate: $billingDate) {
      success
      error
      offer {
        id
      }
    }
  }
`
