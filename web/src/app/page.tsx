import Link from "next/link";
import { Fingerprint, KeyRound, ShieldCheck, Smartphone, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BIG, PageShell } from "@/components/common/PageShell";

const POINTS = [
  { icon: Fingerprint, text: "Sign in with your fingerprint, face or screen lock. No password to forget or leak." },
  { icon: ShieldCheck, text: "No OTPs or SMS codes. Fake look-alike sites can't steal your sign-in." },
  { icon: Smartphone, text: "Use your phone or a security key, add new devices and remove lost ones." },
  { icon: KeyRound, text: "Lost everything? Get back in with your recovery code and a face check." },
];

export default function Landing() {
  return (
    <PageShell
      title="Sign in without passwords"
      voiceText="Welcome. This app has no passwords and no OTP codes. You sign in with your fingerprint, face or screen lock. Press Sign in, or Create account if you are new."
    >
      <ul className="flex flex-col gap-3">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <Icon className="text-primary mt-0.5 size-5 shrink-0" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <Button className={BIG} render={<Link href="/signin" />}>
        <Fingerprint /> Sign in
      </Button>
      <Button className={BIG} variant="outline" render={<Link href="/signup" />}>
        <UserPlus /> Create account
      </Button>
    </PageShell>
  );
}
