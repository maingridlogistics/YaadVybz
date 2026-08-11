import { useContext } from 'react';
import { BusinessContext } from '../contexts/BusinessContext';

export function useBusinesses() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error('useBusinesses must be used within BusinessProvider');
  return context;
}
