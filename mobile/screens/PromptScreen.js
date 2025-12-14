import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Card, TextInput, Button, Text, ActivityIndicator } from 'react-native-paper';
import { getPrompt, updatePrompt } from '../services/api';
import { getPromptTemplate, savePromptTemplate } from '../services/database';

export default function PromptScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    loadPrompt();
  }, []);

  const loadPrompt = async () => {
    try {
      // Try API first, fallback to local DB
      let promptData;
      try {
        const response = await getPrompt();
        promptData = response.prompt || response.template || '';
      } catch (e) {
        promptData = await getPromptTemplate();
      }
      
      if (promptData) {
        setPrompt(promptData);
      }
    } catch (error) {
      console.error('Error loading prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to both API and local DB
      try {
        await updatePrompt(prompt);
      } catch (e) {
        console.log('API save failed, saving to local DB only');
      }
      
      await savePromptTemplate(prompt);
      Alert.alert('Success', 'Prompt template saved successfully!');
    } catch (error) {
      console.error('Error saving prompt:', error);
      Alert.alert('Error', 'Failed to save prompt template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading prompt...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          <Card>
            <Card.Title title="Prompt Template" />
            <Card.Content>
              <Text variant="bodySmall" style={{ marginBottom: 8, color: 'gray' }}>
                Customize the prompt template used to generate bid messages. Use placeholders like
                {' {project_title}, {full_description}, {budget_min}, {budget_max}, {skills_list}'}
              </Text>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                mode="outlined"
                multiline
                numberOfLines={20}
                style={{ minHeight: 400, textAlignVertical: 'top' }}
                placeholder="Enter your prompt template here..."
              />
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={{ marginTop: 16 }}
          >
            Save Prompt Template
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

