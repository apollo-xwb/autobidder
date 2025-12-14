import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBar } from 'expo-status-bar';

import DashboardScreen from './screens/DashboardScreen';
import ConfigScreen from './screens/ConfigScreen';
import PromptScreen from './screens/PromptScreen';
import BidsScreen from './screens/BidsScreen';
import SkillsScreen from './screens/SkillsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              let iconName;

              if (route.name === 'Dashboard') {
                iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
              } else if (route.name === 'Config') {
                iconName = focused ? 'cog' : 'cog-outline';
              } else if (route.name === 'Prompt') {
                iconName = focused ? 'text-box' : 'text-box-outline';
              } else if (route.name === 'Bids') {
                iconName = focused ? 'briefcase' : 'briefcase-outline';
              } else if (route.name === 'Skills') {
                iconName = focused ? 'star' : 'star-outline';
              }

              return <Icon name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: '#6200ee',
            tabBarInactiveTintColor: 'gray',
            headerStyle: {
              backgroundColor: '#6200ee',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          })}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Config" component={ConfigScreen} />
          <Tab.Screen name="Prompt" component={PromptScreen} />
          <Tab.Screen name="Skills" component={SkillsScreen} />
          <Tab.Screen name="Bids" component={BidsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

