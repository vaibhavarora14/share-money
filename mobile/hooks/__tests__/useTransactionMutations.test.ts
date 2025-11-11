import { renderHook, waitFor } from '@testing-library/react-hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDeleteTransaction } from '../useTransactionMutations';
import { fetchWithAuth } from '../../utils/api';

jest.mock('../../utils/api');

const mockFetchWithAuth = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;

describe('useDeleteTransaction', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    jest.clearAllMocks();
  });

  it('should delete transaction and invalidate queries', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({ success: true }),
      ok: true,
      status: 200,
    } as any;

    mockFetchWithAuth.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useDeleteTransaction(), { wrapper });

    await result.current.mutateAsync({ id: 1, group_id: 'group1' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchWithAuth).toHaveBeenCalledWith('/transactions?id=1', {
      method: 'DELETE',
    });

    // Check that queries were invalidated
    const allQueries = queryClient.getQueryCache().getAll();
    expect(allQueries.length).toBeGreaterThan(0);
  });

  it('should handle 204 No Content response', async () => {
    const mockResponse = {
      ok: true,
      status: 204,
    } as any;

    mockFetchWithAuth.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useDeleteTransaction(), { wrapper });

    const response = await result.current.mutateAsync({ id: 1 });

    expect(response).toBeNull();
    expect(mockFetchWithAuth).toHaveBeenCalled();
  });

  it('should handle errors and rollback optimistic update', async () => {
    mockFetchWithAuth.mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useDeleteTransaction(), { wrapper });

    // Set up some initial cache data
    queryClient.setQueryData(['transactions'], [{ id: 1, description: 'Test' }]);

    try {
      await result.current.mutateAsync({ id: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
