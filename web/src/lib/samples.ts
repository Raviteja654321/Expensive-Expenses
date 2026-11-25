/** Realistic sample bank SMS spread over the last few days, so new users can try the app. */
export function sampleInbox(currency: string, now = new Date()): string {
  const ref = () => String(Math.floor(1e11 + Math.random() * 9e11));
  const at = (daysAgo: number, h: number, m: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    if (d > now) d.setTime(now.getTime() - 60_000);
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(off / 60)}:${pad(off % 60)}`;
  };
  const msgs =
    currency === "INR"
      ? [
          [at(3, 13, 10), `Sent Rs.480.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nRef ${ref()}\nNot You? Call 18002586161`],
          [at(2, 19, 45), `INR 1,200.00 spent using ICICI Bank Card XX1234 on PVR INOX LTD. Avl Limit: INR 1,23,456.00. Ref ${ref()}`],
          [at(1, 9, 20), `Dear UPI user A/C X1234 debited by 186.0 trf to UBER INDIA Refno ${ref()}. If not u? call 1800111109. -SBI`],
          [at(1, 18, 5), `Rs 642.50 debited from A/c XX1234 towards BLINKIT. Ref ${ref()}. Avl Bal Rs 24,310.00`],
          [at(0, 12, 30), `Spent Rs.2,499.00 On HDFC Bank Card 1234 At MYNTRA DESIGNS. Ref ${ref()}. Not You? Call 18002586161`],
        ]
      : [
          [at(3, 8, 10), `Chase: You made a $6.45 transaction with STARBUCKS STORE 1182. Ref ${ref()}`],
          [at(2, 20, 15), `American Express: A charge of $54.00 at AMC THEATRES was made on your Card ending in 1004. Ref ${ref()}`],
          [at(1, 9, 40), `Bank of America: A $18.20 purchase at UBER TRIP was made on your card ending in 4421. Ref ${ref()}`],
          [at(1, 17, 55), `Chase: You made a $86.13 transaction with TRADER JOE'S #552. Ref ${ref()}`],
          [at(0, 13, 0), `Chase: You made a $39.99 transaction with AMAZON MKTPL. Ref ${ref()}`],
        ];
  return msgs.map(([t, m]) => `### ${t}\n${m}`).join("\n");
}
