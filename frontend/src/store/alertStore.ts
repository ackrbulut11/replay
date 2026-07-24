import { useState, useEffect } from 'react';

export interface AlertItem {
  id: string;
  symbol: string;
  provider: string;
  timeframe: string;
  target_type: 'price' | 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'ATR' | 'BollingerBands';
  indicator_period?: number;
  indicator_field?: string;
  condition: 'rises_above' | 'falls_below';
  threshold_value: number;
  note?: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'DISABLED';
  created_at: string;
  triggered_at?: string;
  last_value?: number;
}

export interface AlertStoreState {
  alerts: AlertItem[];
  loading: boolean;
  error: string | null;
  isCreateModalOpen: boolean;
  modalSymbol: string;
  modalProvider: string;
  modalCurrentPrice?: number;
  latestTriggeredAlert: AlertItem | null;
}

const listeners = new Set<() => void>();

let state: AlertStoreState = {
  alerts: [],
  loading: false,
  error: null,
  isCreateModalOpen: false,
  modalSymbol: 'BTCUSDT',
  modalProvider: 'binance',
  modalCurrentPrice: undefined,
  latestTriggeredAlert: null,
};

function emitChange() {
  listeners.forEach(listener => listener());
}

export const alertStore = {
  getState: () => state,
  
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setState: (fn: (prev: AlertStoreState) => Partial<AlertStoreState>) => {
    state = { ...state, ...fn(state) };
    emitChange();
  },

  openCreateModal: (symbol: string = 'BTCUSDT', provider: string = 'binance', currentPrice?: number) => {
    alertStore.setState(() => ({
      isCreateModalOpen: true,
      modalSymbol: symbol,
      modalProvider: provider,
      modalCurrentPrice: currentPrice,
    }));
  },

  closeCreateModal: () => {
    alertStore.setState(() => ({
      isCreateModalOpen: false,
    }));
  },

  dismissTriggeredAlert: () => {
    alertStore.setState(() => ({
      latestTriggeredAlert: null,
    }));
  },

  fetchAlerts: async (symbol?: string) => {
    alertStore.setState(() => ({ loading: true, error: null }));
    try {
      const url = symbol ? `/api/alerts?symbol=${encodeURIComponent(symbol)}` : '/api/alerts';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }
      const data = await response.json();
      alertStore.setState(() => ({
        alerts: data.alerts || [],
        loading: false,
      }));
    } catch (err: any) {
      alertStore.setState(() => ({
        error: err.message || 'Alert fetch error',
        loading: false,
      }));
    }
  },

  createAlert: async (alertData: {
    symbol: string;
    provider: string;
    timeframe?: string;
    target_type: string;
    indicator_period?: number;
    condition: string;
    threshold_value: number;
    note?: string;
  }) => {
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.detail || 'Alarm oluşturulamadı.');
      }

      const res = await response.json();
      const newAlert: AlertItem = res.alert;

      alertStore.setState(prev => ({
        alerts: [newAlert, ...prev.alerts],
        isCreateModalOpen: false,
      }));

      return newAlert;
    } catch (err: any) {
      console.error('Create alert error:', err);
      throw err;
    }
  },

  toggleAlertStatus: async (alertId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) throw new Error('Status update failed');
      const res = await response.json();
      const updated: AlertItem = res.alert;

      alertStore.setState(prev => ({
        alerts: prev.alerts.map(a => (a.id === alertId ? updated : a)),
      }));
    } catch (err: any) {
      console.error('Toggle alert error:', err);
    }
  },

  deleteAlert: async (alertId: string) => {
    try {
      const response = await fetch(`/api/alerts/${alertId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');

      alertStore.setState(prev => ({
        alerts: prev.alerts.filter(a => a.id !== alertId),
      }));
    } catch (err: any) {
      console.error('Delete alert error:', err);
    }
  },

  checkAlerts: async (symbol: string, provider: string, currentPrice: number, indicatorValues?: Record<string, number>) => {
    try {
      const response = await fetch('/api/alerts/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          provider,
          current_price: currentPrice,
          indicator_values: indicatorValues || {},
        }),
      });

      if (!response.ok) return;

      const data = await response.json();
      const triggered: AlertItem[] = data.triggered_alerts || [];

      if (triggered.length > 0) {
        // Update local alerts list and set latest triggered alert for notification
        alertStore.setState(prev => {
          const updatedAlerts = prev.alerts.map(a => {
            const found = triggered.find(t => t.id === a.id);
            return found || a;
          });
          return {
            alerts: updatedAlerts,
            latestTriggeredAlert: triggered[triggered.length - 1],
          };
        });
      }
    } catch (err: any) {
      console.error('Check alerts error:', err);
    }
  },
};

export function useAlertStore(): [AlertStoreState, typeof alertStore] {
  const [state, setState] = useState(alertStore.getState());

  useEffect(() => {
    const unsubscribe = alertStore.subscribe(() => {
      setState(alertStore.getState());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return [state, alertStore];
}

