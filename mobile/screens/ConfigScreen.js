import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import {
  Card,
  TextInput,
  Button,
  Text,
  ActivityIndicator,
  Switch,
  Divider,
} from 'react-native-paper';
import { getConfig, updateConfig } from '../services/api';
import { saveConfig, getAllConfig } from '../services/database';

export default function ConfigScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    OAUTH_TOKEN: '',
    YOUR_BIDDER_ID: '',
    GEMINI_API_KEY: '',
    TELEGRAM_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    MIN_BUDGET: '250',
    POLL_INTERVAL: '5',
    BID_AMOUNT_MULTIPLIER: '1.05',
    DEFAULT_DELIVERY_DAYS: '6',
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // Try API first, fallback to local DB
      let configData;
      try {
        configData = await getConfig();
      } catch (e) {
        configData = await getAllConfig();
      }
      
      if (configData) {
        setConfig((prev) => ({ ...prev, ...configData }));
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to both API and local DB
      try {
        await updateConfig(config);
      } catch (e) {
        console.log('API save failed, saving to local DB only');
      }
      
      // Save each config key to local DB
      for (const [key, value] of Object.entries(config)) {
        await saveConfig(key, value);
      }
      
      Alert.alert('Success', 'Config saved successfully!');
    } catch (error) {
      console.error('Error saving config:', error);
      Alert.alert('Error', 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading config...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Card style={{ marginBottom: 16 }}>
          <Card.Title title="API Credentials" />
          <Card.Content>
            <TextInput
              label="OAuth Token"
              value={config.OAUTH_TOKEN}
              onChangeText={(text) => updateField('OAUTH_TOKEN', text)}
              mode="outlined"
              secureTextEntry
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Bidder ID"
              value={config.YOUR_BIDDER_ID?.toString()}
              onChangeText={(text) => updateField('YOUR_BIDDER_ID', text)}
              mode="outlined"
              keyboardType="numeric"
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Gemini API Key"
              value={config.GEMINI_API_KEY}
              onChangeText={(text) => updateField('GEMINI_API_KEY', text)}
              mode="outlined"
              secureTextEntry
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Telegram Token"
              value={config.TELEGRAM_TOKEN}
              onChangeText={(text) => updateField('TELEGRAM_TOKEN', text)}
              mode="outlined"
              secureTextEntry
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Telegram Chat ID"
              value={config.TELEGRAM_CHAT_ID}
              onChangeText={(text) => updateField('TELEGRAM_CHAT_ID', text)}
              mode="outlined"
              keyboardType="numeric"
            />
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Title title="Bid Settings" />
          <Card.Content>
            <TextInput
              label="Minimum Budget ($)"
              value={config.MIN_BUDGET}
              onChangeText={(text) => updateField('MIN_BUDGET', text)}
              mode="outlined"
              keyboardType="numeric"
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Poll Interval (seconds)"
              value={config.POLL_INTERVAL}
              onChangeText={(text) => updateField('POLL_INTERVAL', text)}
              mode="outlined"
              keyboardType="numeric"
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Bid Amount Multiplier"
              value={config.BID_AMOUNT_MULTIPLIER}
              onChangeText={(text) => updateField('BID_AMOUNT_MULTIPLIER', text)}
              mode="outlined"
              keyboardType="decimal-pad"
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Default Delivery Days"
              value={config.DEFAULT_DELIVERY_DAYS}
              onChangeText={(text) => updateField('DEFAULT_DELIVERY_DAYS', text)}
              mode="outlined"
              keyboardType="numeric"
            />
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={{ marginBottom: 16 }}
        >
          Save Config
        </Button>
      </View>
    </ScrollView>
  );
}

