#!/usr/bin/env python3
"""
Add caching layer to reduce API costs
Caches responses so same code doesn't need re-analysis
"""

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Optional, Dict

class ResponseCache:
    """Cache API responses to reduce costs"""
    
    def __init__(self, cache_db: str = "api_cache.db"):
        self.cache_db = cache_db
        self.init_db()
    
    def init_db(self):
        """Initialize cache database"""
        conn = sqlite3.connect(self.cache_db)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cache (
                code_hash TEXT PRIMARY KEY,
                response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                access_count INTEGER DEFAULT 1
            )
        """)
        conn.commit()
        conn.close()
    
    def get_cache_key(self, code: str, context: Dict = None) -> str:
        """Generate cache key from code and context"""
        cache_data = {
            "code": code,
            "context": context or {}
        }
        cache_str = json.dumps(cache_data, sort_keys=True)
        return hashlib.sha256(cache_str.encode()).hexdigest()
    
    def get(self, code: str, context: Dict = None) -> Optional[Dict]:
        """Get cached response if exists"""
        cache_key = self.get_cache_key(code, context)
        
        conn = sqlite3.connect(self.cache_db)
        cursor = conn.execute(
            "SELECT response, access_count FROM cache WHERE code_hash = ?",
            (cache_key,)
        )
        result = cursor.fetchone()
        
        if result:
            response = json.loads(result[0])
            # Update access count
            conn.execute(
                "UPDATE cache SET access_count = access_count + 1 WHERE code_hash = ?",
                (cache_key,)
            )
            conn.commit()
            conn.close()
            return response
        
        conn.close()
        return None
    
    def set(self, code: str, response: Dict, context: Dict = None):
        """Cache API response"""
        cache_key = self.get_cache_key(code, context)
        
        conn = sqlite3.connect(self.cache_db)
        conn.execute(
            "INSERT OR REPLACE INTO cache (code_hash, response) VALUES (?, ?)",
            (cache_key, json.dumps(response))
        )
        conn.commit()
        conn.close()
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        conn = sqlite3.connect(self.cache_db)
        cursor = conn.execute("SELECT COUNT(*), SUM(access_count) FROM cache")
        result = cursor.fetchone()
        conn.close()
        
        return {
            "cached_items": result[0] or 0,
            "total_hits": result[1] or 0,
            "avg_hits_per_item": (result[1] or 0) / (result[0] or 1)
        }

# Example usage in your API service
def analyze_with_cache(code: str, api_call_func):
    """Analyze code with caching"""
    cache = ResponseCache()
    
    # Check cache first
    cached = cache.get(code)
    if cached:
        print("✅ Cache hit - no API cost!")
        return cached
    
    # Call API (costs money)
    print("💰 API call - caching result...")
    response = api_call_func(code)
    
    # Cache for next time
    cache.set(code, response)
    
    return response

if __name__ == "__main__":
    # Test cache
    cache = ResponseCache()
    
    test_code = "def transfer_funds(from_account, to_account, amount):\n    from_account.balance -= amount"
    
    # First call - cache miss
    result1 = cache.get(test_code)
    print(f"First call (cache miss): {result1 is None}")
    
    # Simulate API response
    api_response = {"vulnerability": "authorization_order_flaw", "severity": "CRITICAL"}
    cache.set(test_code, api_response)
    
    # Second call - cache hit
    result2 = cache.get(test_code)
    print(f"Second call (cache hit): {result2 is not None}")
    print(f"Response: {result2}")
    
    # Stats
    stats = cache.get_stats()
    print(f"\nCache stats: {stats}")

