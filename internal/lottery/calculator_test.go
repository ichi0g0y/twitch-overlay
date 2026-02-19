package lottery

import "testing"

func TestCalculateBaseTickets(t *testing.T) {
	tests := []struct {
		name   string
		input  []RewardUsage
		limit  int
		expect int
	}{
		{
			name:   "single reward usage",
			input:  []RewardUsage{{Count: 1}},
			limit:  3,
			expect: 1,
		},
		{
			name:   "multiple reward usage sum",
			input:  []RewardUsage{{Count: 1}, {Count: 2}},
			limit:  3,
			expect: 3,
		},
		{
			name:   "cap by limit",
			input:  []RewardUsage{{Count: 2}, {Count: 2}},
			limit:  3,
			expect: 3,
		},
		{
			name:   "default count for zero value",
			input:  []RewardUsage{{Count: 0}, {Count: 0}},
			limit:  3,
			expect: 2,
		},
		{
			name:   "default limit when non-positive",
			input:  []RewardUsage{{Count: 2}, {Count: 2}},
			limit:  0,
			expect: 3,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := CalculateBaseTickets(tc.input, tc.limit)
			if got != tc.expect {
				t.Fatalf("CalculateBaseTickets() = %d, want %d", got, tc.expect)
			}
		})
	}
}

func TestCalculateFinalTickets(t *testing.T) {
	tests := []struct {
		name   string
		base   int
		sub    *SubscriptionInfo
		expect int
	}{
		{
			name:   "non subscriber",
			base:   3,
			sub:    nil,
			expect: 3,
		},
		{
			name: "tier1 1 month minimum bonus",
			base: 3,
			sub: &SubscriptionInfo{
				Tier:             "1000",
				CumulativeMonths: 1,
			},
			expect: 4,
		},
		{
			name: "tier1 6 months",
			base: 3,
			sub: &SubscriptionInfo{
				Tier:             "1000",
				CumulativeMonths: 6,
			},
			expect: 6,
		},
		{
			name: "tier3 12 months",
			base: 3,
			sub: &SubscriptionInfo{
				Tier:             "3000",
				CumulativeMonths: 12,
			},
			expect: 9,
		},
		{
			name: "unknown tier has no bonus",
			base: 3,
			sub: &SubscriptionInfo{
				Tier:             "unknown",
				CumulativeMonths: 12,
			},
			expect: 3,
		},
		{
			name: "apply final tickets limit",
			base: 3,
			sub: &SubscriptionInfo{
				Tier:              "3000",
				CumulativeMonths:  12,
				FinalTicketsLimit: 7,
			},
			expect: 7,
		},
		{
			name: "negative base ticket",
			base: -1,
			sub: &SubscriptionInfo{
				Tier:             "1000",
				CumulativeMonths: 1,
			},
			expect: 1,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := CalculateFinalTickets(tc.base, tc.sub)
			if got != tc.expect {
				t.Fatalf("CalculateFinalTickets() = %d, want %d", got, tc.expect)
			}
		})
	}
}
