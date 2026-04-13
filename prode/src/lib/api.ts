import axios from 'axios';
import { Platform } from 'react-native';

const getBaseUrl = () => {
  if (Platform.OS === 'web') {
    return __DEV__ ? 'http://localhost:3001' : '';
  }
  return 'http://localhost:3001';
};

export const getWorldCupMatches = async () => {
  try {
    const url = `${getBaseUrl()}/api/matches`;
    const response = await axios.get(url);
    return response.data.matches || [];
  } catch (error: any) {
    console.error('Error fetching world cup matches:', error.message);
    if (error.response) {
      console.error('Detalle del error:', error.response.data);
    }
    return [];
  }
};

export const getWorldCupStandings = async () => {
  try {
    const url = `${getBaseUrl()}/api/standings`;
    const response = await axios.get(url);
    return response.data.standings || [];
  } catch (error: any) {
    console.error('Error fetching world cup standings:', error.message);
    if (error.response) {
      console.error('Detalle del error:', error.response.data);
    }
    return [];
  }
};
