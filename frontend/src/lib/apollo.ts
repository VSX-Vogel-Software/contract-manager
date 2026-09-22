import { ApolloClient, ApolloLink, InMemoryCache, createHttpLink, from } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import { getMainDefinition } from '@apollo/client/utilities'
import { handleApolloError } from './apolloErrors'
import { handleMutationResult } from './resultErrors'

const httpLink = createHttpLink({
  uri: '/graphql',
  credentials: 'include',
})

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('auth_token')
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  }
})

export const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
  handleApolloError({ graphQLErrors, networkError, operation })
})

// Fehler, die als Nutzdaten zurueckkommen (success: false), erreichen den
// errorLink nicht - auf GraphQL-Ebene war die Antwort erfolgreich.
export const resultErrorLink = new ApolloLink((operation, forward) =>
  forward(operation).map((response) => {
    const definition = getMainDefinition(operation.query)
    const isMutation =
      definition.kind === 'OperationDefinition' && definition.operation === 'mutation'
    if (isMutation) {
      handleMutationResult({
        data: response.data as Record<string, unknown> | null,
        operation,
      })
    }
    return response
  })
)

export const apolloClient = new ApolloClient({
  link: from([errorLink, resultErrorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    },
  },
})
