import axios from 'axios';

// Change this to your Python API server URL
const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const getConfig = async () => {
  try {
    const response = await api.get('/config');
    return response.data;
  } catch (error) {
    console.error('Error fetching config:', error);
    throw error;
  }
};

export const updateConfig = async (config) => {
  try {
    const response = await api.post('/config', config);
    return response.data;
  } catch (error) {
    console.error('Error updating config:', error);
    throw error;
  }
};

export const getPrompt = async () => {
  try {
    const response = await api.get('/prompt');
    return response.data;
  } catch (error) {
    console.error('Error fetching prompt:', error);
    throw error;
  }
};

export const updatePrompt = async (prompt) => {
  try {
    const response = await api.post('/prompt', { prompt });
    return response.data;
  } catch (error) {
    console.error('Error updating prompt:', error);
    throw error;
  }
};

export const getBids = async () => {
  try {
    const response = await api.get('/bids');
    return response.data;
  } catch (error) {
    console.error('Error fetching bids:', error);
    throw error;
  }
};

export const getStats = async () => {
  try {
    const response = await api.get('/stats');
    return response.data;
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
};

export const startAutobidder = async () => {
  try {
    const response = await api.post('/autobidder/start');
    return response.data;
  } catch (error) {
    console.error('Error starting autobidder:', error);
    throw error;
  }
};

export const stopAutobidder = async () => {
  try {
    const response = await api.post('/autobidder/stop');
    return response.data;
  } catch (error) {
    console.error('Error stopping autobidder:', error);
    throw error;
  }
};

export const getAutobidderStatus = async () => {
  try {
    const response = await api.get('/autobidder/status');
    return response.data;
  } catch (error) {
    console.error('Error fetching autobidder status:', error);
    throw error;
  }
};

