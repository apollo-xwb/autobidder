import React, { useState, useEffect } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Card, Text, Button, ActivityIndicator, FAB } from 'react-native-paper';
import { getStats, getAutobidderStatus, startAutobidder, stopAutobidder } from '../services/api';
import { getBidsCache } from '../services/database';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function DashboardScreen() {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const loadData = async () => {
    try {
      const [statsData, statusData, bidsData] = await Promise.all([
        getStats().catch(() => null),
        getAutobidderStatus().catch(() => null),
        getBidsCache(),
      ]);
      setStats(statsData);
      setStatus(statusData);
      setBids(bidsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startAutobidder();
      await loadData();
    } catch (error) {
      console.error('Error starting autobidder:', error);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopAutobidder();
      await loadData();
    } catch (error) {
      console.error('Error stopping autobidder:', error);
    } finally {
      setStopping(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading...</Text>
      </View>
    );
  }

  const isRunning = status?.running || false;
  const totalBids = bids.length;
  const successfulBids = bids.filter(b => b.status === 'applied').length;
  const wonBids = bids.filter(b => b.status === 'won').length;
  const totalValue = bids.reduce((sum, b) => sum + (b.bid_amount || 0), 0);
  const totalProfit = bids.filter(b => b.profit).reduce((sum, b) => sum + (b.profit || 0), 0);

  return (
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ padding: 16 }}>
        {/* Status Card */}
        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Icon
                name={isRunning ? 'play-circle' : 'stop-circle'}
                size={24}
                color={isRunning ? '#4caf50' : '#f44336'}
              />
              <Text variant="titleLarge" style={{ marginLeft: 8 }}>
                Autobidder {isRunning ? 'Running' : 'Stopped'}
              </Text>
            </View>
            {status && (
              <Text variant="bodyMedium" style={{ color: 'gray' }}>
                {status.message || 'No status available'}
              </Text>
            )}
            <View style={{ flexDirection: 'row', marginTop: 16, gap: 8 }}>
              <Button
                mode="contained"
                onPress={handleStart}
                disabled={isRunning || starting}
                style={{ flex: 1 }}
                icon="play"
              >
                {starting ? 'Starting...' : 'Start'}
              </Button>
              <Button
                mode="contained"
                buttonColor="#f44336"
                onPress={handleStop}
                disabled={!isRunning || stopping}
                style={{ flex: 1 }}
                icon="stop"
              >
                {stopping ? 'Stopping...' : 'Stop'}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Stats Cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <Card style={{ flex: 1, minWidth: '45%' }}>
            <Card.Content>
              <Text variant="titleLarge">{totalBids}</Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Total Bids
              </Text>
            </Card.Content>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%' }}>
            <Card.Content>
              <Text variant="titleLarge">{successfulBids}</Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Applied
              </Text>
            </Card.Content>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%' }}>
            <Card.Content>
              <Text variant="titleLarge">{wonBids}</Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Won
              </Text>
            </Card.Content>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%' }}>
            <Card.Content>
              <Text variant="titleLarge">${totalValue.toFixed(0)}</Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Total Value
              </Text>
            </Card.Content>
          </Card>
        </View>

        {totalProfit > 0 && (
          <Card style={{ marginBottom: 16, backgroundColor: '#e8f5e9' }}>
            <Card.Content>
              <Text variant="titleLarge" style={{ color: '#4caf50' }}>
                ${totalProfit.toFixed(2)}
              </Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Total Profit
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Recent Bids */}
        <Card>
          <Card.Title title="Recent Bids" />
          <Card.Content>
            {bids.length === 0 ? (
              <Text style={{ color: 'gray', textAlign: 'center', padding: 20 }}>
                No bids yet
              </Text>
            ) : (
              bids.slice(0, 5).map((bid) => (
                <View
                  key={bid.project_id}
                  style={{
                    padding: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: '#e0e0e0',
                  }}
                >
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {bid.title || `Project ${bid.project_id}`}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text variant="bodySmall" style={{ color: 'gray' }}>
                      ${bid.bid_amount || 0}
                    </Text>
                    <Text variant="bodySmall" style={{ color: 'gray' }}>
                      {bid.status || 'applied'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

