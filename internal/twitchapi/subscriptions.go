package twitchapi

import (
	"errors"
	"sync"
	"time"
)

const subscriptionCacheTTL = 30 * time.Minute

type subscriptionCacheEntry struct {
	subscription    *UserSubscription
	isNotSubscribed bool
	cachedAt        time.Time
}

var (
	subscriptionCacheMu sync.RWMutex
	subscriptionCache   = map[string]subscriptionCacheEntry{}
	subscriptionFetcher = GetUserSubscription
)

// GetUserSubscriptionCached retrieves subscription information with 30-minute cache.
func GetUserSubscriptionCached(broadcasterID, userID string) (*UserSubscription, error) {
	now := time.Now()
	key := broadcasterID + ":" + userID

	subscriptionCacheMu.RLock()
	entry, ok := subscriptionCache[key]
	subscriptionCacheMu.RUnlock()

	if ok && now.Sub(entry.cachedAt) < subscriptionCacheTTL {
		if entry.isNotSubscribed {
			return nil, ErrUserNotSubscribed
		}
		return cloneUserSubscription(entry.subscription), nil
	}

	sub, err := subscriptionFetcher(broadcasterID, userID)
	if err != nil {
		if errors.Is(err, ErrUserNotSubscribed) {
			subscriptionCacheMu.Lock()
			subscriptionCache[key] = subscriptionCacheEntry{
				isNotSubscribed: true,
				cachedAt:        now,
			}
			subscriptionCacheMu.Unlock()
		}
		return nil, err
	}

	subscriptionCacheMu.Lock()
	subscriptionCache[key] = subscriptionCacheEntry{
		subscription: cloneUserSubscription(sub),
		cachedAt:     now,
	}
	subscriptionCacheMu.Unlock()

	return cloneUserSubscription(sub), nil
}

// ClearSubscriptionCache clears all cached subscription entries.
func ClearSubscriptionCache() {
	subscriptionCacheMu.Lock()
	subscriptionCache = map[string]subscriptionCacheEntry{}
	subscriptionCacheMu.Unlock()
}

func cloneUserSubscription(sub *UserSubscription) *UserSubscription {
	if sub == nil {
		return nil
	}
	cloned := *sub
	return &cloned
}
