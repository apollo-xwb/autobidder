import React, { useState, useEffect } from 'react';
import { View, ScrollView, RefreshControl, FlatList } from 'react-native';
import { Card, Text, Chip, ActivityIndicator, Searchbar } from 'react-native-paper';
import { getBids } from '../services/api';
import { getBidsCache } from '../services/database';

export default function BidsScreen() {
  const [bids, setBids] = useState([]);
  const [filteredBids, setFilteredBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadBids();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = bids.filter(
        (bid) =>
          bid.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bid.project_id?.toString().includes(searchQuery)
      );
      setFilteredBids(filtered);
    } else {
      setFilteredBids(bids);
    }
  }, [searchQuery, bids]);

  const loadBids = async () => {
    try {
      // Try API first, fallback to local DB
      let bidsData = [];
      try {
        const response = await getBids();
        bidsData = response.bids || response || [];
      } catch (e) {
        bidsData = await getBidsCache();
      }
      
      setBids(bidsData);
      setFilteredBids(bidsData);
    } catch (error) {
      console.error('Error loading bids:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBids();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'won':
        return '#4caf50';
      case 'applied':
        return '#2196f3';
      default:
        return '#757575';
    }
  };

  const renderBid = ({ item }) => (
    <Card style={{ marginBottom: 12, marginHorizontal: 16 }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text variant="titleMedium" numberOfLines={2} style={{ flex: 1 }}>
            {item.title || `Project ${item.project_id}`}
          </Text>
          <Chip
            style={{ backgroundColor: getStatusColor(item.status) }}
            textStyle={{ color: 'white' }}
          >
            {item.status || 'applied'}
          </Chip>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <View>
            <Text variant="bodySmall" style={{ color: 'gray' }}>
              Project ID
            </Text>
            <Text variant="bodyMedium">{item.project_id}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="bodySmall" style={{ color: 'gray' }}>
              Bid Amount
            </Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
              ${item.bid_amount?.toFixed(2) || '0.00'}
            </Text>
          </View>
        </View>
        {item.profit !== undefined && item.profit !== null && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e0e0e0' }}>
            <Text variant="bodySmall" style={{ color: 'gray' }}>
              Profit
            </Text>
            <Text
              variant="bodyMedium"
              style={{ fontWeight: 'bold', color: item.profit > 0 ? '#4caf50' : '#f44336' }}
            >
              ${item.profit.toFixed(2)}
            </Text>
          </View>
        )}
        {item.applied_at && (
          <Text variant="bodySmall" style={{ color: 'gray', marginTop: 8 }}>
            Applied: {new Date(item.applied_at).toLocaleString()}
          </Text>
        )}
      </Card.Content>
    </Card>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading bids...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Searchbar
        placeholder="Search bids..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={{ margin: 16 }}
      />
      <FlatList
        data={filteredBids}
        renderItem={renderBid}
        keyExtractor={(item) => item.project_id?.toString() || Math.random().toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: 'gray', textAlign: 'center' }}>
              {searchQuery ? 'No bids match your search' : 'No bids yet'}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 16 }}
      />
    </View>
  );
}

