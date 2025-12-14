import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert, FlatList } from 'react-native';
import {
  Card,
  TextInput,
  Button,
  Text,
  ActivityIndicator,
  Chip,
  IconButton,
} from 'react-native-paper';
import { getConfig, updateConfig } from '../services/api';
import { getSkills, saveSkills } from '../services/database';

export default function SkillsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState('');

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      // Try API first, fallback to local DB
      let skillsData = [];
      try {
        const config = await getConfig();
        skillsData = config.MY_SKILLS || [];
      } catch (e) {
        skillsData = await getSkills();
      }
      
      setSkills(skillsData);
    } catch (error) {
      console.error('Error loading skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSkill = () => {
    const trimmed = newSkill.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to both API and local DB
      try {
        const config = await getConfig().catch(() => ({}));
        await updateConfig({ ...config, MY_SKILLS: skills });
      } catch (e) {
        console.log('API save failed, saving to local DB only');
      }
      
      await saveSkills(skills);
      Alert.alert('Success', 'Skills saved successfully!');
    } catch (error) {
      console.error('Error saving skills:', error);
      Alert.alert('Error', 'Failed to save skills');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading skills...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Card style={{ marginBottom: 16 }}>
          <Card.Title title="Add Skill" />
          <Card.Content>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={newSkill}
                onChangeText={setNewSkill}
                mode="outlined"
                placeholder="Enter skill name"
                style={{ flex: 1 }}
                onSubmitEditing={handleAddSkill}
              />
              <Button mode="contained" onPress={handleAddSkill} icon="plus">
                Add
              </Button>
            </View>
          </Card.Content>
        </Card>

        <Card>
          <Card.Title title={`Your Skills (${skills.length})`} />
          <Card.Content>
            {skills.length === 0 ? (
              <Text style={{ color: 'gray', textAlign: 'center', padding: 20 }}>
                No skills added yet
              </Text>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {skills.map((skill, index) => (
                  <Chip
                    key={index}
                    onClose={() => handleRemoveSkill(skill)}
                    style={{ marginBottom: 8 }}
                  >
                    {skill}
                  </Chip>
                ))}
              </View>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={{ marginTop: 16 }}
        >
          Save Skills
        </Button>
      </View>
    </ScrollView>
  );
}

