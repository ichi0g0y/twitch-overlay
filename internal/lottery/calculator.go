package lottery

import "math"

const (
	defaultBaseTicketsLimit = 3
	tier1Coefficient        = 1.0
	tier2Coefficient        = 1.1
	tier3Coefficient        = 1.2
)

// RewardUsage は1ユーザーのリワード使用情報を表す。
type RewardUsage struct {
	Count int
}

// SubscriptionInfo は口数計算に必要なサブスク情報を表す。
type SubscriptionInfo struct {
	Tier              string
	CumulativeMonths  int
	FinalTicketsLimit int
}

// CalculateBaseTickets はリワード使用回数を合算し、基本口数上限を適用する。
func CalculateBaseTickets(userRewards []RewardUsage, limit int) int {
	if limit <= 0 {
		limit = defaultBaseTicketsLimit
	}

	total := 0
	for _, usage := range userRewards {
		count := usage.Count
		// Count未設定の場合は1回利用として扱う。
		if count <= 0 {
			count = 1
		}
		total += count
	}

	if total > limit {
		return limit
	}
	return total
}

// CalculateFinalTickets は基本口数にサブスクボーナスを加算して最終口数を返す。
func CalculateFinalTickets(baseTickets int, subInfo *SubscriptionInfo) int {
	if baseTickets < 0 {
		baseTickets = 0
	}

	if subInfo == nil {
		return baseTickets
	}

	months := subInfo.CumulativeMonths
	if months < 0 {
		months = 0
	}

	coefficient := tierCoefficient(subInfo.Tier)
	bonus := 0

	if coefficient > 0 {
		rawBonus := float64(months) * coefficient * 1.1 / 3.0
		bonus = int(math.Ceil(rawBonus))

		// サブスク登録者は計算結果が0でも最低1口ボーナスを付与。
		if bonus < 1 {
			bonus = 1
		}
	}

	finalTickets := baseTickets + bonus
	if subInfo.FinalTicketsLimit > 0 && finalTickets > subInfo.FinalTicketsLimit {
		return subInfo.FinalTicketsLimit
	}

	return finalTickets
}

func tierCoefficient(tier string) float64 {
	switch tier {
	case "1000", "tier1", "Tier1", "TIER1":
		return tier1Coefficient
	case "2000", "tier2", "Tier2", "TIER2":
		return tier2Coefficient
	case "3000", "tier3", "Tier3", "TIER3":
		return tier3Coefficient
	default:
		return 0
	}
}
