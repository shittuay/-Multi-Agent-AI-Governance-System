import React, { useState, useEffect } from 'react';
import { Shield, Users, FileCheck, Eye, AlertTriangle, Settings, Home, MessageSquare } from 'lucide-react';

// Intelligent Bedrock Service with contextual responses
const bedrockService = {
  async invokeModel(prompt, agentType) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    
    const promptLower = prompt.toLowerCase();
    
    // Contextual response generation based on prompt analysis
    switch (agentType) {
      case 'compliance':
        return this.generateComplianceResponse(promptLower, prompt);
      case 'audit':
        return this.generateAuditResponse(promptLower, prompt);
      case 'ethics':
        return this.generateEthicsResponse(promptLower, prompt);
      case 'privacy':
        return this.generatePrivacyResponse(promptLower, prompt);
      default:
        return "I'm ready to assist with your governance needs.";
    }
  },

  generateComplianceResponse(promptLower, originalPrompt) {
    // GDPR-specific responses
    if (promptLower.includes('gdpr') || promptLower.includes('data protection')) {
      return `**GDPR Compliance Analysis:**

**Current Requirements:**
• Article 25: Data Protection by Design and by Default
• Article 32: Security of Processing Requirements
• Article 5: Data Processing Principles (lawfulness, fairness, transparency)
• Article 13-14: Information to be provided to data subjects

**Compliance Status:**
✅ Privacy Notice: Updated and compliant
✅ Consent Management: 99.2% valid consents
⚠️ Data Retention: 3 legacy datasets need review
✅ DPO Appointment: In place and functioning

**Immediate Actions Required:**
1. Complete Article 25 implementation review
2. Update data retention schedules
3. Conduct quarterly GDPR training refresh

**Next Review:** Q1 2025`;
    }

    // SOX-specific responses
    if (promptLower.includes('sox') || promptLower.includes('sarbanes')) {
      return `**SOX 404 Compliance Status:**

**Internal Controls Assessment:**
• Management Assessment: 95% effective controls
• External Auditor Testing: In progress
• Deficiencies Identified: 2 minor, 0 material weaknesses

**Key Requirements:**
✅ Section 302: CEO/CFO Certifications current
✅ Section 404: Internal controls documentation complete
⚠️ Section 409: Real-time disclosure process needs update

**Action Items:**
1. Update SOX 404 documentation by Q4 end
2. Remediate 2 minor control deficiencies
3. Prepare for external auditor testing

**Compliance Score:** 95% - Strong`;
    }

    // ISO-specific responses
    if (promptLower.includes('iso') || promptLower.includes('27001')) {
      return `**ISO 27001 Compliance Review:**

**Certification Status:**
• Current Certification: Valid until March 2025
• Surveillance Audit: Scheduled for January 2025
• Non-conformities: 0 major, 2 minor

**Control Implementation:**
✅ Access Controls (A.9): Fully implemented
✅ Cryptography (A.10): Meeting standards
⚠️ Incident Management (A.16): Process refinement needed
✅ Business Continuity (A.17): Tested and validated

**Renewal Preparation:**
1. Address minor non-conformities
2. Update risk assessment documentation
3. Conduct pre-audit internal review

**Recommendation:** Begin renewal process in Q1 2025`;
    }

    // General compliance or broad questions
    if (promptLower.includes('assess') || promptLower.includes('review') || promptLower.includes('status')) {
      return `**Comprehensive Compliance Assessment:**

**Regulatory Framework Status:**
• GDPR Compliance: 96% - Minor data retention issues
• SOX 404 Controls: 95% - Documentation updates needed
• ISO 27001: 98% - Renewal preparation required
• Industry Standards: 94% - Training completion pending

**Risk Areas Identified:**
1. **Medium Risk:** Legacy data retention processes
2. **Low Risk:** Employee training completion rates
3. **Low Risk:** Third-party vendor assessments

**Recommended Actions:**
• Schedule Q4 compliance review meeting
• Update policy documentation
• Complete pending staff training
• Prepare for upcoming audits

**Overall Compliance Score:** 96% - Strong position`;
    }

    // Default compliance response
    return `**Compliance Guidance:**

I can help you with various compliance matters including:
• GDPR and data protection requirements
• SOX 404 internal controls
• ISO 27001 information security standards
• Regulatory risk assessments
• Policy reviews and updates

What specific compliance area would you like me to analyze?

**Recent Compliance Updates:**
• Data Protection regulations updated
• New cybersecurity standards published
• Industry-specific guidelines released

Please ask me about any specific regulation or compliance requirement.`;
  },

  generateAuditResponse(promptLower, originalPrompt) {
    if (promptLower.includes('risk') || promptLower.includes('assessment')) {
      return `**Risk Assessment Analysis:**

**High-Risk Areas Identified:**
1. **Financial Controls:** Revenue recognition processes
2. **IT Security:** Access management controls
3. **Operational:** Inventory management procedures

**Risk Scoring:**
• Financial Risk: Medium (Score: 6/10)
• Operational Risk: Low-Medium (Score: 4/10)
• Compliance Risk: Low (Score: 3/10)
• Reputational Risk: Low (Score: 2/10)

**Mitigation Strategies:**
✅ Implemented: Enhanced approval workflows
⚠️ In Progress: Automated monitoring systems
🔄 Planned: Quarterly risk reassessment

**Next Steps:**
1. Focus on financial controls enhancement
2. Complete IT security control testing
3. Update risk register quarterly

**Risk Appetite:** Within acceptable tolerance levels`;
    }

    if (promptLower.includes('internal control') || promptLower.includes('effectiveness')) {
      return `**Internal Control Effectiveness Review:**

**Control Testing Results:**
• Design Effectiveness: 98% of controls properly designed
• Operating Effectiveness: 95% functioning as intended
• Key Controls Tested: 127 out of 130 controls

**Control Categories:**
✅ **Financial Reporting:** 96% effective
✅ **Access Controls:** 99% effective
⚠️ **Process Controls:** 92% effective (needs attention)
✅ **Monitoring Controls:** 97% effective

**Deficiencies Found:**
• 2 Minor deficiencies in expense approval process
• 1 Process improvement opportunity in procurement

**Management Response:**
All deficiencies have remediation plans with target completion by Q1 2025.

**Overall Assessment:** Strong internal control environment`;
    }

    if (promptLower.includes('findings') || promptLower.includes('recommendations')) {
      return `**Audit Findings & Recommendations:**

**Current Cycle Key Findings:**
1. **Process Efficiency:** Procurement cycle time can be reduced by 25%
2. **Control Gaps:** Manual approval processes prone to delays
3. **Documentation:** Some policies need updating

**Recommendations by Priority:**

**High Priority:**
• Implement automated approval workflows
• Update segregation of duties matrix
• Enhance vendor management controls

**Medium Priority:**
• Streamline month-end close process
• Improve IT change management
• Update policy documentation

**Low Priority:**
• Enhance reporting dashboards
• Optimize approval routing

**Implementation Timeline:** 6-12 months
**Expected Benefits:** 30% process efficiency improvement`;
    }

    // Default audit response
    return `**Audit Services Available:**

I can assist with:
• Internal control assessments
• Risk evaluation and scoring
• Process efficiency reviews
• Compliance testing procedures
• Audit planning and scoping

**Current Audit Status:**
• Q4 2024 Audit: 75% complete
• Outstanding Items: 3 medium-priority findings
• Next Audit Cycle: Q1 2025

**Recent Audit Activities:**
• Financial controls testing completed
• IT general controls review in progress
• Operational audit planning underway

What specific audit area would you like me to focus on?`;
  },

  generateEthicsResponse(promptLower, originalPrompt) {
    if (promptLower.includes('code of conduct') || promptLower.includes('policy')) {
      return `**Code of Conduct Review:**

**Policy Coverage:**
✅ Anti-corruption and bribery
✅ Conflict of interest guidelines
✅ Gift and entertainment limits
✅ Confidentiality and data protection
✅ Respectful workplace standards

**Compliance Metrics:**
• Policy Acknowledgment: 99.5% of employees
• Training Completion: 98% current year
• Violations Reported: 3 minor, 0 major
• Investigation Closure Rate: 100% within SLA

**Recent Updates:**
• Social media guidelines enhanced
• Remote work ethics standards added
• Supplier code of conduct updated

**Recommendations:**
1. Annual policy refresh training
2. Enhanced manager training on ethics leadership
3. Update policy to address AI/ML ethics

**Next Review:** March 2025`;
    }

    if (promptLower.includes('conflict') || promptLower.includes('interest')) {
      return `**Conflict of Interest Analysis:**

**Current Disclosures:**
• Total Disclosures: 47 employees
• Approved with Conditions: 44
• Under Review: 2
• Rejected: 1

**Common Conflict Types:**
1. **Financial Interests:** Investment in suppliers/competitors
2. **Outside Employment:** Board positions, consulting
3. **Family Relationships:** Vendor connections
4. **Personal Relationships:** Workplace dating

**Management Actions:**
• Annual disclosure certification: 100% complete
• Quarterly review process: Functioning effectively
• Ethics committee review: All cases assessed

**Red Flags to Monitor:**
⚠️ Undisclosed vendor relationships
⚠️ Unusual approval patterns
⚠️ Procurement decision influences

**Recommendation:** Implement automated monitoring for potential conflicts`;
    }

    if (promptLower.includes('training') || promptLower.includes('awareness')) {
      return `**Ethics Training Program Status:**

**Completion Rates:**
• Annual Ethics Training: 98.2% complete
• New Employee Orientation: 100% within 30 days
• Leadership Ethics Module: 95% complete
• Specialized Training (Finance): 97% complete

**Training Effectiveness:**
• Knowledge Assessment Scores: Average 92%
• Post-Training Surveys: 4.6/5.0 satisfaction
• Behavior Change Indicators: Positive trend

**Upcoming Training:**
📅 **Q1 2025:** Refresher training for all staff
📅 **Q2 2025:** Advanced leadership ethics
📅 **Ongoing:** Monthly ethics spotlights

**Training Topics Covered:**
✅ Anti-corruption and bribery
✅ Conflicts of interest
✅ Data privacy and confidentiality
✅ Respectful workplace behavior
✅ Social media and communications

**Recommendation:** Add AI ethics module for 2025`;
    }

    // Default ethics response
    return `**Ethics Program Overview:**

**Program Health Check:**
• Ethics Culture Score: 4.4/5.0 (employee survey)
• Reporting Confidence: 89% trust in process
• Leadership Commitment: Strong visible support
• Policy Awareness: 96% of employees familiar

**Available Support:**
• Ethics Hotline: 24/7 anonymous reporting
• Ethics Counselor: Available for consultation
• Ombudsman: Independent conflict resolution
• Open Door Policy: Direct management access

**Recent Ethics Initiatives:**
• Ethics Week campaign completed
• Leadership ethics roundtables
• Ethics recognition program launched

How can I help with your specific ethics inquiry?`;
  },

  generatePrivacyResponse(promptLower, originalPrompt) {
    if (promptLower.includes('gdpr') || promptLower.includes('data subject') || promptLower.includes('rights')) {
      return `**Data Subject Rights Management:**

**Request Volume (Last 30 Days):**
• Access Requests: 23 (Average response: 18 days)
• Rectification: 7 (Average response: 12 days)
• Erasure: 15 (Average response: 20 days)
• Portability: 4 (Average response: 15 days)
• Objection: 2 (Average response: 10 days)

**Processing Status:**
✅ Within GDPR Timelines: 96% of requests
⚠️ Extended Timeline: 2 complex cases (justified)
✅ Quality Review: 100% responses reviewed

**Common Request Types:**
1. **Employment Records:** 35% of requests
2. **Customer Data:** 40% of requests
3. **Marketing Data:** 20% of requests
4. **Other:** 5% of requests

**Process Improvements:**
• Automated data discovery tools implemented
• Response time reduced by 25%
• Customer self-service portal launched

**Action Items:**
1. Complete 2 outstanding complex cases
2. Update data mapping for new systems
3. Enhance automated response capabilities`;
    }

    if (promptLower.includes('impact assessment') || promptLower.includes('pia') || promptLower.includes('dpia')) {
      return `**Privacy Impact Assessment Status:**

**Recent DPIA Activities:**
• **Q4 2024 Completed:** CRM system upgrade (Low risk)
• **In Progress:** AI chatbot implementation (Medium risk)
• **Planned Q1 2025:** HR system replacement (High risk)

**Risk Assessment Results:**
🟢 **Low Risk Projects:** 8 (proceed with standard safeguards)
🟡 **Medium Risk Projects:** 3 (additional controls required)
🔴 **High Risk Projects:** 1 (DPO consultation required)

**Key Risk Factors:**
• Large-scale data processing
• Sensitive data categories
• Automated decision-making
• International data transfers
• Vulnerable data subjects

**Mitigation Measures:**
✅ Data minimization principles applied
✅ Purpose limitation enforced
✅ Technical safeguards implemented
✅ Organizational measures in place

**Next DPIAs Required:**
1. Employee monitoring system
2. Third-party analytics platform
3. Customer behavior tracking`;
    }

    if (promptLower.includes('breach') || promptLower.includes('incident')) {
      return `**Data Breach Response Status:**

**Incident Summary (Last 12 Months):**
• Total Incidents: 4
• Reportable to DPA: 1
• Data Subjects Notified: 247
• Resolution Time: Average 18 hours

**Incident Categories:**
🔴 **High Impact:** 1 (unauthorized access - resolved)
🟡 **Medium Impact:** 2 (system vulnerabilities - patched)
🟢 **Low Impact:** 1 (human error - contained)

**Response Team Performance:**
• Detection Time: Average 2.4 hours (Target: <4 hours)
• Containment Time: Average 6.1 hours (Target: <8 hours)
• DPA Notification: Within 72 hours (100% compliance)
• Communication: Timely and transparent

**Lessons Learned:**
1. Enhanced employee training reduced human error incidents
2. Automated monitoring improved detection time
3. Incident response playbooks proved effective

**Preparedness Level:** 95% - Well prepared for incidents`;
    }

    // Default privacy response
    return `**Privacy Program Overview:**

**Program Maturity:**
• Data Governance: Mature (Level 4/5)
• Technical Controls: Advanced (Level 4/5)
• Organizational Measures: Strong (Level 4/5)
• Incident Response: Excellent (Level 5/5)

**Key Metrics:**
• Data Processing Activities: 127 documented
• Valid Consents: 99.2% of records
• Privacy Training: 97% completion rate
• Policy Compliance: 96% adherence

**Recent Achievements:**
✅ ISO 27701 certification obtained
✅ Cross-border transfer framework updated
✅ Privacy-by-design principles embedded
✅ Automated privacy controls deployed

**Focus Areas:**
• Emerging technology privacy
• AI/ML data protection
• International expansion support
• Enhanced transparency measures

What specific privacy matter can I help you with?`;
  }
};

const MultiAgentGovernance = () => {
  const [activeAgent, setActiveAgent] = useState('home');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const agents = [
    { 
      id: 'home', 
      name: 'Dashboard', 
      icon: Home, 
      color: 'bg-gray-500', 
      description: 'Overview and system status' 
    },
    { 
      id: 'compliance', 
      name: 'Compliance Agent', 
      icon: Shield, 
      color: 'bg-governance-blue', 
      description: 'Regulatory compliance monitoring' 
    },
    { 
      id: 'audit', 
      name: 'Audit Agent', 
      icon: FileCheck, 
      color: 'bg-audit-purple', 
      description: 'Internal audit and risk assessment' 
    },
    { 
      id: 'ethics', 
      name: 'Ethics Agent', 
      icon: Users, 
      color: 'bg-ethics-orange', 
      description: 'Ethics and conduct oversight' 
    },
    { 
      id: 'privacy', 
      name: 'Privacy Agent', 
      icon: Eye, 
      color: 'bg-privacy-red', 
      description: 'Data privacy and protection' 
    }
  ];

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || activeAgent === 'home') return;

    const newMessage = {
      id: Date.now(),
      text: inputMessage,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await bedrockService.invokeModel(inputMessage, activeAgent);
      
      const agentResponse = {
        id: Date.now() + 1,
        text: response,
        sender: 'agent',
        agentType: activeAgent,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, agentResponse]);
    } catch (error) {
      console.error('Error communicating with agent:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'agent',
        agentType: activeAgent,
        timestamp: new Date().toLocaleTimeString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const currentAgent = agents.find(agent => agent.id === activeAgent);

  const DashboardView = () => (
    <div className="p-6 space-y-6">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Governance Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {agents.filter(agent => agent.id !== 'home').map((agent) => {
          const Icon = agent.icon;
          return (
            <div 
              key={agent.id}
              className="bg-white rounded-lg shadow-md p-6 border-l-4 border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setActiveAgent(agent.id)}
            >
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-full ${agent.color} text-white`}>
                  <Icon size={24} />
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">Active</p>
                  <p className="text-gray-600">Status</p>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                <p className="text-gray-600 text-sm mt-1">{agent.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <Shield className="text-governance-blue" size={20} />
            <div>
              <p className="font-medium">Compliance check completed</p>
              <p className="text-sm text-gray-600">2 minutes ago</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-purple-50 rounded-lg">
            <FileCheck className="text-audit-purple" size={20} />
            <div>
              <p className="font-medium">Audit report generated</p>
              <p className="text-sm text-gray-600">15 minutes ago</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-orange-50 rounded-lg">
            <Users className="text-ethics-orange" size={20} />
            <div>
              <p className="font-medium">Ethics training reminder sent</p>
              <p className="text-sm text-gray-600">1 hour ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const ChatView = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className={`inline-flex p-4 rounded-full ${currentAgent.color} text-white mb-4`}>
              <currentAgent.icon size={32} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {currentAgent.name}
            </h3>
            <p className="text-gray-600">{currentAgent.description}</p>
            <p className="text-sm text-gray-500 mt-2">Ask me anything about {currentAgent.id}!</p>
          </div>
        )}
        
        {messages.map((message) => (
          <div 
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.sender === 'user' 
                  ? 'bg-blue-500 text-white' 
                  : message.isError 
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              <p className={`text-xs mt-1 ${
                message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
              }`}>
                {message.timestamp}
              </p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="border-t bg-white p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask ${currentAgent.name} a question...`}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <MessageSquare size={20} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-gray-900">Governance AI</h1>
          <p className="text-sm text-gray-600">Multi-Agent Platform</p>
        </div>
        
        <nav className="mt-6">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <button
                key={agent.id}
                onClick={() => {
                  setActiveAgent(agent.id);
                  if (agent.id !== 'home') {
                    setMessages([]);
                  }
                }}
                className={`w-full flex items-center space-x-3 px-6 py-3 text-left hover:bg-gray-50 transition-colors ${
                  activeAgent === agent.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                }`}
              >
                <div className={`p-2 rounded ${agent.color} text-white`}>
                  <Icon size={16} />
                </div>
                <span className="font-medium text-gray-900">{agent.name}</span>
              </button>
            );
          })}
        </nav>
        
        <div className="absolute bottom-0 w-64 p-6 border-t">
          <button className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {currentAgent.name}
            </h2>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-600">All systems operational</span>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-hidden">
          {activeAgent === 'home' ? <DashboardView /> : <ChatView />}
        </main>
      </div>
    </div>
  );
};

export default MultiAgentGovernance;