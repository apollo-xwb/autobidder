#!/usr/bin/env python3
"""
Unit tests for autobidder start/stop functionality
"""
import unittest
import sys
import os
import time
import subprocess
import requests
import json

# Add the current directory to the path so we can import api_server
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Try to import Flask app
try:
    from api_server import app
    APP_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import api_server: {e}")
    APP_AVAILABLE = False

API_BASE_URL = "http://localhost:8000"
API_PREFIX = "/api"

class TestAutobidderControl(unittest.TestCase):
    """Test autobidder start/stop endpoints"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test class"""
        cls.client = None
        if APP_AVAILABLE:
            app.config['TESTING'] = True
            cls.client = app.test_client()
        else:
            print("Warning: Testing via HTTP requests instead of Flask test client")
    
    def setUp(self):
        """Set up before each test"""
        self.api_url = API_BASE_URL
        if not APP_AVAILABLE:
            # Test via HTTP
            try:
                response = requests.get(f"{self.api_url}/health", timeout=2)
                if response.status_code != 200:
                    self.skipTest("API server is not running")
            except requests.exceptions.RequestException:
                self.skipTest("API server is not accessible")
    
    def test_stop_endpoint_exists(self):
        """Test that stop endpoint exists and is accessible"""
        if self.client:
            response = self.client.post('/api/autobidder/stop')
            # Should return 200 or 500, but not 404
            self.assertNotEqual(response.status_code, 404, "Stop endpoint should exist")
            self.assertIn(response.status_code, [200, 500], f"Unexpected status code: {response.status_code}")
            
            # Check response is JSON
            try:
                data = response.get_json()
                self.assertIsInstance(data, dict, "Response should be JSON")
                self.assertIn('success', data, "Response should have 'success' field")
            except:
                self.fail("Response should be valid JSON")
        else:
            # Test via HTTP
            try:
                response = requests.post(f"{self.api_url}{API_PREFIX}/autobidder/stop", timeout=5)
                self.assertNotEqual(response.status_code, 404, "Stop endpoint should exist")
                self.assertIn(response.status_code, [200, 500], f"Unexpected status code: {response.status_code}")
                
                # Check response is JSON
                try:
                    data = response.json()
                    self.assertIsInstance(data, dict, "Response should be JSON")
                    self.assertIn('success', data, "Response should have 'success' field")
                except:
                    self.fail("Response should be valid JSON")
            except requests.exceptions.RequestException as e:
                self.fail(f"Failed to connect to API: {e}")
    
    def test_stop_endpoint_returns_success(self):
        """Test that stop endpoint returns success (even if bot not running)"""
        if self.client:
            response = self.client.post('/api/autobidder/stop')
            data = response.get_json()
            
            # Should return success=True (even if bot wasn't running)
            self.assertEqual(data.get('success'), True, 
                           f"Stop should return success=True. Got: {data}")
            self.assertIn('message', data, "Response should have 'message' field")
        else:
            try:
                response = requests.post(f"{self.api_url}{API_PREFIX}/autobidder/stop", timeout=5)
                data = response.json()
                
                self.assertEqual(data.get('success'), True, 
                               f"Stop should return success=True. Got: {data}")
                self.assertIn('message', data, "Response should have 'message' field")
            except requests.exceptions.RequestException as e:
                self.fail(f"Failed to connect to API: {e}")
    
    def test_start_endpoint_exists(self):
        """Test that start endpoint exists and is accessible"""
        if self.client:
            response = self.client.post('/api/autobidder/start')
            # Should return 200 or 500, but not 404
            self.assertNotEqual(response.status_code, 404, "Start endpoint should exist")
            self.assertIn(response.status_code, [200, 500], f"Unexpected status code: {response.status_code}")
            
            # Check response is JSON
            try:
                data = response.get_json()
                self.assertIsInstance(data, dict, "Response should be JSON")
                self.assertIn('success', data, "Response should have 'success' field")
            except:
                self.fail("Response should be valid JSON")
        else:
            try:
                response = requests.post(f"{self.api_url}{API_PREFIX}/autobidder/start", timeout=5)
                self.assertNotEqual(response.status_code, 404, "Start endpoint should exist")
                self.assertIn(response.status_code, [200, 500], f"Unexpected status code: {response.status_code}")
                
                try:
                    data = response.json()
                    self.assertIsInstance(data, dict, "Response should be JSON")
                    self.assertIn('success', data, "Response should have 'success' field")
                except:
                    self.fail("Response should be valid JSON")
            except requests.exceptions.RequestException as e:
                self.fail(f"Failed to connect to API: {e}")
    
    def test_start_stop_cycle(self):
        """Test starting and then stopping the bot"""
        if self.client:
            # Stop first (in case it's running)
            stop_response = self.client.post('/api/autobidder/stop')
            stop_data = stop_response.get_json()
            self.assertEqual(stop_data.get('success'), True, "Stop should succeed")
            
            time.sleep(1)  # Give it a moment
            
            # Start
            start_response = self.client.post('/api/autobidder/start')
            start_data = start_response.get_json()
            
            # Start might fail if config is missing, but should return JSON
            self.assertIsInstance(start_data, dict, "Start response should be JSON")
            self.assertIn('success', start_data, "Start response should have 'success' field")
            
            time.sleep(2)  # Give it a moment to start
            
            # Stop again
            stop_response2 = self.client.post('/api/autobidder/stop')
            stop_data2 = stop_response2.get_json()
            self.assertEqual(stop_data2.get('success'), True, 
                           f"Stop should succeed. Got: {stop_data2}")
        else:
            # Test via HTTP
            try:
                # Stop first
                stop_response = requests.post(f"{self.api_url}{API_PREFIX}/autobidder/stop", timeout=5)
                stop_data = stop_response.json()
                self.assertEqual(stop_data.get('success'), True, "Stop should succeed")
                
                time.sleep(1)
                
                # Start
                start_response = requests.post(f"{self.api_url}{API_PREFIX}/autobidder/start", timeout=5)
                start_data = start_response.json()
                self.assertIsInstance(start_data, dict, "Start response should be JSON")
                self.assertIn('success', start_data, "Start response should have 'success' field")
                
                time.sleep(2)
                
                # Stop again
                stop_response2 = requests.post(f"{self.api_url}{API_PREFIX}/autobidder/stop", timeout=5)
                stop_data2 = stop_response2.json()
                self.assertEqual(stop_data2.get('success'), True, 
                               f"Stop should succeed. Got: {stop_data2}")
            except requests.exceptions.RequestException as e:
                self.fail(f"Failed to connect to API: {e}")
    
    def test_stop_multiple_times(self):
        """Test stopping multiple times (should always succeed)"""
        if self.client:
            # Stop multiple times
            for i in range(3):
                response = self.client.post('/api/autobidder/stop')
                data = response.get_json()
                self.assertEqual(data.get('success'), True, 
                               f"Stop attempt {i+1} should succeed. Got: {data}")
                time.sleep(0.5)
        else:
            try:
                for i in range(3):
                    response = requests.post(f"{self.api_url}{API_PREFIX}/autobidder/stop", timeout=5)
                    data = response.json()
                    self.assertEqual(data.get('success'), True, 
                                   f"Stop attempt {i+1} should succeed. Got: {data}")
                    time.sleep(0.5)
            except requests.exceptions.RequestException as e:
                self.fail(f"Failed to connect to API: {e}")
    
    def test_status_endpoint(self):
        """Test that status endpoint works"""
        if self.client:
            response = self.client.get('/api/autobidder/status')
            self.assertEqual(response.status_code, 200, "Status endpoint should return 200")
            data = response.get_json()
            self.assertIsInstance(data, dict, "Status response should be JSON")
            self.assertIn('running', data, "Status should have 'running' field")
        else:
            try:
                response = requests.get(f"{self.api_url}{API_PREFIX}/autobidder/status", timeout=5)
                self.assertEqual(response.status_code, 200, "Status endpoint should return 200")
                data = response.json()
                self.assertIsInstance(data, dict, "Status response should be JSON")
                self.assertIn('running', data, "Status should have 'running' field")
            except requests.exceptions.RequestException as e:
                self.fail(f"Failed to connect to API: {e}")


def run_tests():
    """Run all tests"""
    print("=" * 60)
    print("Autobidder Control Tests")
    print("=" * 60)
    print()
    
    # Check if API server is running
    if not APP_AVAILABLE:
        print("Note: Testing via HTTP requests (API server should be running)")
        print(f"API URL: {API_BASE_URL}")
        print()
    
    # Run tests
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestAutobidderControl)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("All tests passed!")
    else:
        print("X Some tests failed")
        print(f"Failures: {len(result.failures)}")
        print(f"Errors: {len(result.errors)}")
        if result.failures:
            print("\nFailures:")
            for test, traceback in result.failures:
                print(f"  - {test}")
                print(f"    {traceback}")
        if result.errors:
            print("\nErrors:")
            for test, traceback in result.errors:
                print(f"  - {test}")
                print(f"    {traceback}")
    print("=" * 60)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)

