import BrandLogo from "@/components/BrandLogo";
import FeedbackForm from "@/components/FeedbackForm";
import PublicNavigation from "@/components/PublicNavigation";

export default function FeedbackPage() {
  return <main className="public-page feedback-page"><header className="site-header"><BrandLogo href="/" priority /><PublicNavigation /></header><header className="public-page-header"><div><p className="kicker">XMASKEDFREAKS</p><h1>Feedback</h1><p>Send a private note to the team. Other customers cannot see your submission.</p></div></header><section className="feedback-panel"><FeedbackForm /></section></main>;
}
