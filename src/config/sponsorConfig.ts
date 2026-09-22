import type { SponsorConfig } from "../types/config";

// Keep the sponsor route available, but do not publish template payment data.
export const sponsorConfig: SponsorConfig = {
	title: "",
	description: "",
	usage: "",
	showComment: false,
	showButtonInPost: false,
	methods: [],
	sponsors: [],
	showSponsorsList: false,
};
