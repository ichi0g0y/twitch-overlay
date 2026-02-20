package lottery

import "testing"

func benchmarkDrawLottery(b *testing.B, participantCount int) {
	participants := GenerateParticipants(participantCount)
	options := DrawOptions{
		BaseTicketsLimit:  3,
		FinalTicketsLimit: 0,
	}

	originalRandom := drawRandomInt
	drawRandomInt = func(max int) (int, error) {
		if max <= 0 {
			return 0, errInvalidTicketsTotal
		}
		return max - 1, nil
	}
	b.Cleanup(func() {
		drawRandomInt = originalRandom
	})

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		result, err := DrawLottery(participants, options)
		if err != nil {
			b.Fatalf("DrawLottery failed: %v", err)
		}
		if result == nil || result.Winner == nil {
			b.Fatalf("winner should not be nil")
		}
	}
}

func BenchmarkDrawLottery_100(b *testing.B) {
	benchmarkDrawLottery(b, 100)
}

func BenchmarkDrawLottery_500(b *testing.B) {
	benchmarkDrawLottery(b, 500)
}
