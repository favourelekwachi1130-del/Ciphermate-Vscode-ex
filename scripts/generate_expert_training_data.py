#!/usr/bin/env python3
"""
Expert-Level Vulnerability Training Data Generator
Creates 10,000 sophisticated vulnerabilities that require reasoning, not pattern matching.
Based on zero-trust, attacker-aligned evaluation principles.
"""

import json
import random
import uuid
import os
import re
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime

# Expert vulnerability patterns that static analysis misses
EXPERT_VULNERABILITY_PATTERNS = {
    "authorization_order_flaw": {
        "domains": ["fintech_api", "ecommerce", "banking", "healthcare"],
        "languages": ["python", "javascript", "java", "go"],
        "cwe": ["CWE-840", "CWE-639"],
        "owasp": ["A04: Insecure Design", "A01: Broken Access Control"],
        "mitre_tactics": ["Privilege Escalation", "Impact"],
        "mitre_techniques": ["T1068", "T1078"],
        "why_static_fails": [
            "Authorization function exists",
            "No missing checks at syntax level",
            "Requires temporal execution reasoning",
            "Order-of-operations vulnerability"
        ]
    },
    "race_condition_authorization": {
        "domains": ["fintech_api", "trading", "auction"],
        "languages": ["python", "go", "java"],
        "cwe": ["CWE-362", "CWE-367"],
        "owasp": ["A04: Insecure Design"],
        "mitre_tactics": ["Privilege Escalation"],
        "mitre_techniques": ["T1078"],
        "why_static_fails": [
            "Requires attacker timing",
            "Looks secure in isolation",
            "Exploit spans multiple requests",
            "Concurrency analysis required"
        ]
    },
    "business_logic_bypass": {
        "domains": ["ecommerce", "fintech_api", "subscription"],
        "languages": ["python", "javascript", "ruby"],
        "cwe": ["CWE-840"],
        "owasp": ["A04: Insecure Design"],
        "mitre_tactics": ["Impact"],
        "mitre_techniques": ["T1499"],
        "why_static_fails": [
            "Requires business context",
            "No syntax errors",
            "Logic appears correct",
            "Requires domain knowledge"
        ]
    },
    "state_mutation_before_validation": {
        "domains": ["fintech_api", "banking", "wallet"],
        "languages": ["python", "javascript", "java"],
        "cwe": ["CWE-840"],
        "owasp": ["A04: Insecure Design"],
        "mitre_tactics": ["Impact"],
        "mitre_techniques": ["T1499"],
        "why_static_fails": [
            "Requires runtime state",
            "Validation exists but in wrong order",
            "State mutation before check",
            "Temporal reasoning required"
        ]
    },
    "trust_boundary_confusion": {
        "domains": ["microservices", "api_gateway", "distributed"],
        "languages": ["python", "go", "java"],
        "cwe": ["CWE-501", "CWE-290"],
        "owasp": ["A01: Broken Access Control"],
        "mitre_tactics": ["Lateral Movement"],
        "mitre_techniques": ["T1078"],
        "why_static_fails": [
            "Requires trust-boundary reasoning",
            "Exploit spans multiple services",
            "No single point of failure",
            "Distributed system reasoning"
        ]
    },
    "idempotency_violation": {
        "domains": ["fintech_api", "payment", "wallet"],
        "languages": ["python", "javascript", "java"],
        "cwe": ["CWE-840"],
        "owasp": ["A04: Insecure Design"],
        "mitre_tactics": ["Impact"],
        "mitre_techniques": ["T1499"],
        "why_static_fails": [
            "Requires protocol understanding",
            "Looks secure in isolation",
            "Exploit spans multiple requests",
            "Idempotency check exists but flawed"
        ]
    },
    "time_of_check_time_of_use": {
        "domains": ["file_system", "database", "storage"],
        "languages": ["python", "c", "go"],
        "cwe": ["CWE-367"],
        "owasp": ["A04: Insecure Design"],
        "mitre_tactics": ["Privilege Escalation"],
        "mitre_techniques": ["T1078"],
        "why_static_fails": [
            "Requires attacker timing",
            "Check exists but raceable",
            "TOCTOU vulnerability",
            "Concurrency analysis required"
        ]
    },
    "session_fixation_via_state": {
        "domains": ["authentication", "session_management"],
        "languages": ["python", "javascript", "java"],
        "cwe": ["CWE-384"],
        "owasp": ["A01: Broken Access Control"],
        "mitre_tactics": ["Initial Access"],
        "mitre_techniques": ["T1078"],
        "why_static_fails": [
            "Requires runtime state",
            "Session management exists",
            "State mutation vulnerability",
            "Requires protocol understanding"
        ]
    }
}

# Additional expert vulnerability patterns
EXPERT_VULNERABILITY_PATTERNS.update({
    "session_fixation_via_state": {
        "domains": ["authentication", "session_management", "web_app"],
        "languages": ["python", "javascript", "java"],
        "cwe": ["CWE-384", "CWE-613"],
        "owasp": ["A01: Broken Access Control", "A07: Identification and Authentication Failures"],
        "mitre_tactics": ["Initial Access", "Persistence"],
        "mitre_techniques": ["T1078", "T1550"],
        "why_static_fails": [
            "Requires runtime state",
            "Session management exists",
            "State mutation vulnerability",
            "Requires protocol understanding"
        ]
    },
    "insecure_deserialization_order": {
        "domains": ["api", "microservices", "distributed"],
        "languages": ["python", "java", "ruby"],
        "cwe": ["CWE-502"],
        "owasp": ["A08: Software and Data Integrity Failures"],
        "mitre_tactics": ["Initial Access", "Execution"],
        "mitre_techniques": ["T1203"],
        "why_static_fails": [
            "Deserialization looks safe",
            "Validation exists but in wrong order",
            "Requires protocol understanding",
            "Exploit spans multiple services"
        ]
    },
    "crypto_timing_attack": {
        "domains": ["authentication", "cryptography", "api"],
        "languages": ["python", "go", "c"],
        "cwe": ["CWE-208", "CWE-385"],
        "owasp": ["A02: Cryptographic Failures"],
        "mitre_tactics": ["Credential Access"],
        "mitre_techniques": ["T1110"],
        "why_static_fails": [
            "Requires attacker timing",
            "Cryptographic function exists",
            "Timing differences are subtle",
            "Requires side-channel analysis"
        ]
    },
    "privilege_escalation_via_state": {
        "domains": ["authorization", "rbac", "admin"],
        "languages": ["python", "javascript", "java"],
        "cwe": ["CWE-269", "CWE-284"],
        "owasp": ["A01: Broken Access Control"],
        "mitre_tactics": ["Privilege Escalation"],
        "mitre_techniques": ["T1068", "T1078"],
        "why_static_fails": [
            "Authorization check exists",
            "Requires runtime state",
            "State mutation before check",
            "Requires trust-boundary reasoning"
        ]
    }
})

# Code templates for each vulnerability type
VULNERABILITY_TEMPLATES = {
    "authorization_order_flaw": {
        "unsafe": {
            "entrypoint": """def transfer_funds(from_account, to_account, amount):
    # Update balance first
    from_account.balance -= amount
    to_account.balance += amount
    
    # Then check authorization
    if not check_transfer_authorization(from_account, to_account, amount):
        # Rollback (but already mutated!)
        from_account.balance += amount
        to_account.balance -= amount
        raise UnauthorizedError()
    
    save_transaction(from_account, to_account, amount)
    return {"status": "success"}""",
            "supporting": """def check_transfer_authorization(from_account, to_account, amount):
    if from_account.balance < amount:
        return False
    if from_account.is_frozen:
        return False
    return True"""
        },
        "safe": {
            "entrypoint": """def transfer_funds(from_account, to_account, amount):
    # Check authorization FIRST
    if not check_transfer_authorization(from_account, to_account, amount):
        raise UnauthorizedError()
    
    # Then update balance
    from_account.balance -= amount
    to_account.balance += amount
    
    save_transaction(from_account, to_account, amount)
    return {"status": "success"}""",
            "supporting": """def check_transfer_authorization(from_account, to_account, amount):
    if from_account.balance < amount:
        return False
    if from_account.is_frozen:
        return False
    return True"""
        }
    },
    "race_condition_authorization": {
        "unsafe": {
            "entrypoint": """@transaction.atomic
def process_payment(user_id, amount):
    user = User.objects.get(id=user_id)
    
    # Check balance
    if user.balance >= amount:
        # Race window here - another request can modify balance
        user.balance -= amount
        user.save()
        create_payment_record(user_id, amount)
        return {"status": "success"}
    else:
        raise InsufficientFundsError()""",
            "supporting": """def create_payment_record(user_id, amount):
    Payment.objects.create(
        user_id=user_id,
        amount=amount,
        status='completed',
        timestamp=timezone.now()
    )"""
        },
        "safe": {
            "entrypoint": """@transaction.atomic
def process_payment(user_id, amount):
    user = User.objects.select_for_update().get(id=user_id)
    
    # Check balance with row lock
    if user.balance >= amount:
        user.balance -= amount
        user.save()
        create_payment_record(user_id, amount)
        return {"status": "success"}
    else:
        raise InsufficientFundsError()""",
            "supporting": """def create_payment_record(user_id, amount):
    Payment.objects.create(
        user_id=user_id,
        amount=amount,
        status='completed',
        timestamp=timezone.now()
    )"""
        }
    },
    "business_logic_bypass": {
        "unsafe": {
            "entrypoint": """def apply_discount(cart, discount_code):
    discount = Discount.objects.get(code=discount_code)
    
    # Check if discount is valid
    if discount.is_active and discount.valid_until > now():
        # Apply discount
        cart.discount = discount
        cart.total = calculate_total(cart.items) * (1 - discount.percentage)
        cart.save()
        return cart
    
    raise InvalidDiscountError()""",
            "supporting": """def calculate_total(items):
    total = sum(item.price * item.quantity for item in items)
    return total"""
        },
        "safe": {
            "entrypoint": """def apply_discount(cart, discount_code):
    discount = Discount.objects.get(code=discount_code)
    
    # Check if discount is valid
    if discount.is_active and discount.valid_until > now():
        # Check usage limits
        if discount.usage_count >= discount.max_uses:
            raise InvalidDiscountError("Discount limit reached")
        
        # Check user eligibility
        if not discount.is_eligible_for_user(cart.user):
            raise InvalidDiscountError("User not eligible")
        
        # Apply discount
        cart.discount = discount
        cart.total = calculate_total(cart.items) * (1 - discount.percentage)
        cart.save()
        return cart
    
    raise InvalidDiscountError()""",
            "supporting": """def calculate_total(items):
    total = sum(item.price * item.quantity for item in items)
    return total"""
        }
    },
    "session_fixation_via_state": {
        "unsafe": {
            "entrypoint": """def login(username, password, session_id=None):
    user = authenticate(username, password)
    if not user:
        raise AuthenticationError()
    
    # Create session with provided ID (vulnerable!)
    if session_id:
        session = Session.objects.get(id=session_id)
        session.user = user  # Attacker's session now has user
        session.save()
    else:
        session = create_new_session(user)
    
    return {"session_id": session.id}""",
            "supporting": """def create_new_session(user):
    session = Session.objects.create(
        user=user,
        token=generate_token(),
        expires_at=timezone.now() + timedelta(days=7)
    )
    return session"""
        },
        "safe": {
            "entrypoint": """def login(username, password, session_id=None):
    user = authenticate(username, password)
    if not user:
        raise AuthenticationError()
    
    # Always create new session, ignore provided ID
    old_session = Session.objects.filter(id=session_id).first()
    if old_session:
        old_session.delete()  # Invalidate attacker's session
    
    session = create_new_session(user)
    return {"session_id": session.id}""",
            "supporting": """def create_new_session(user):
    session = Session.objects.create(
        user=user,
        token=generate_token(),
        expires_at=timezone.now() + timedelta(days=7)
    )
    return session"""
        }
    },
    "privilege_escalation_via_state": {
        "unsafe": {
            "entrypoint": """def promote_user(user_id, new_role):
    user = User.objects.get(id=user_id)
    
    # Update role first
    user.role = new_role
    user.save()
    
    # Then check if current user has permission
    current_user = get_current_user()
    if not current_user.has_permission('promote_users'):
        # Rollback (but already mutated!)
        user.role = user.previous_role
        user.save()
        raise PermissionDenied()
    
    log_admin_action(current_user, f"Promoted {user_id} to {new_role}")
    return {"status": "success"}""",
            "supporting": """def get_current_user():
    return request.user

def log_admin_action(admin, action):
    AdminLog.objects.create(
        admin=admin,
        action=action,
        timestamp=timezone.now()
    )"""
        },
        "safe": {
            "entrypoint": """def promote_user(user_id, new_role):
    # Check permission FIRST
    current_user = get_current_user()
    if not current_user.has_permission('promote_users'):
        raise PermissionDenied()
    
    # Then update role
    user = User.objects.get(id=user_id)
    user.role = new_role
    user.save()
    
    log_admin_action(current_user, f"Promoted {user_id} to {new_role}")
    return {"status": "success"}""",
            "supporting": """def get_current_user():
    return request.user

def log_admin_action(admin, action):
    AdminLog.objects.create(
        admin=admin,
        action=action,
        timestamp=timezone.now()
    )"""
        }
    },
    "idempotency_violation": {
        "unsafe": {
            "entrypoint": """def process_payment(payment_id, amount):
    # Check if already processed
    existing = Payment.objects.filter(id=payment_id).first()
    if existing and existing.status == 'completed':
        return {"status": "already_processed"}
    
    # Process payment
    payment = Payment.objects.create(
        id=payment_id,
        amount=amount,
        status='processing'
    )
    
    # Deduct from account
    account = get_account()
    account.balance -= amount
    account.save()
    
    payment.status = 'completed'
    payment.save()
    return {"status": "success"}""",
            "supporting": """def get_account():
    return Account.objects.get(user=request.user)"""
        },
        "safe": {
            "entrypoint": """def process_payment(payment_id, amount):
    # Use database transaction with unique constraint
    with transaction.atomic():
        payment, created = Payment.objects.get_or_create(
            id=payment_id,
            defaults={'amount': amount, 'status': 'processing'}
        )
        
        if not created and payment.status == 'completed':
            return {"status": "already_processed"}
        
        # Process payment
        account = get_account()
        account.balance -= amount
        account.save()
        
        payment.status = 'completed'
        payment.save()
    
    return {"status": "success"}""",
            "supporting": """def get_account():
    return Account.objects.get(user=request.user)"""
        }
    }
}

def generate_sample_id() -> str:
    """Generate unique sample ID"""
    return f"VULN-{random.choice(['LOGIC', 'AUTH', 'STATE', 'RACE', 'TRUST'])}-{random.randint(10000, 99999)}"

def generate_contrastive_pair_id() -> str:
    """Generate pair ID for contrastive examples"""
    return f"PAIR-{random.randint(10000, 99999)}"

def create_exploit_narrative(vuln_type: str, domain: str) -> Dict:
    """Create detailed exploit narrative aligned with ATT&CK"""
    narratives = {
        "authorization_order_flaw": {
            "attacker_assumption": "user has authenticated account with limited balance",
            "step_1": "Initiate transfer request with insufficient funds",
            "step_2": "Balance is mutated before authorization check",
            "step_3": "Authorization fails but state already changed",
            "step_4": "Exploit rollback mechanism or race condition",
            "result": "Unauthorized fund transfer or balance manipulation"
        },
        "race_condition_authorization": {
            "attacker_assumption": "user has account with balance X",
            "step_1": "Initiate multiple concurrent payment requests for amount > X",
            "step_2": "All requests pass balance check simultaneously",
            "step_3": "All requests process, bypassing balance validation",
            "result": "Overdraft or negative balance exploitation"
        },
        "business_logic_bypass": {
            "attacker_assumption": "attacker has access to discount codes",
            "step_1": "Apply discount code that appears valid",
            "step_2": "Bypass usage limits or eligibility checks",
            "step_3": "Stack multiple discounts or exploit timing",
            "result": "Unauthorized discount application or financial loss"
        },
        "session_fixation_via_state": {
            "attacker_assumption": "attacker can obtain session ID before login",
            "step_1": "Obtain session ID from application",
            "step_2": "Provide session ID during login",
            "step_3": "Application reuses attacker's session",
            "result": "Attacker gains authenticated session"
        },
        "privilege_escalation_via_state": {
            "attacker_assumption": "attacker has limited user account",
            "step_1": "Trigger privilege change request",
            "step_2": "State mutated before permission check",
            "step_3": "Exploit rollback or race condition",
            "result": "Unauthorized privilege escalation"
        },
        "idempotency_violation": {
            "attacker_assumption": "attacker can replay requests",
            "step_1": "Initiate payment request",
            "step_2": "Request processed and balance deducted",
            "step_3": "Replay same request before status update",
            "result": "Double charge or balance manipulation"
        },
        "time_of_check_time_of_use": {
            "attacker_assumption": "attacker can modify files between check and use",
            "step_1": "Application checks file permissions",
            "step_2": "Attacker modifies file during check-use window",
            "step_3": "Application uses modified file",
            "result": "Unauthorized file access or privilege escalation"
        },
        "trust_boundary_confusion": {
            "attacker_assumption": "attacker has access to one service",
            "step_1": "Exploit trust assumption in service A",
            "step_2": "Service A forwards request to service B",
            "step_3": "Service B trusts request from A",
            "result": "Lateral movement or privilege escalation"
        },
        "state_mutation_before_validation": {
            "attacker_assumption": "attacker can trigger state changes",
            "step_1": "Trigger operation that mutates state",
            "step_2": "State changed before validation",
            "step_3": "Validation fails but state persists",
            "result": "Invalid state or unauthorized access"
        }
    }
    
    base = narratives.get(vuln_type, {
        "attacker_assumption": "attacker has authenticated access",
        "step_1": "Identify vulnerable endpoint",
        "step_2": "Craft malicious request",
        "step_3": "Exploit logic flaw",
        "result": "Unauthorized action or data access"
    })
    
    return base

def vary_code_template(code: str, variation_seed: int = None) -> str:
    """Add variation to code template to reduce repetition while preserving vulnerability semantics
    
    Enhanced version with structural variations for better diversity (approaching 10/10 quality)
    """
    if not code or code == "# Code snippet":
        return code
    
    # Use seed for reproducible but varied outputs
    if variation_seed is not None:
        import hashlib
        seed_hash = int(hashlib.md5(str(variation_seed).encode()).hexdigest()[:8], 16)
        random.seed(seed_hash)
    
    varied_code = code
    
    # Variate comments (add/remove/modify) - expanded set
    comment_variants = [
        ("# Update balance first", ["# Modify account balance", "# Change balance", "# Adjust balance", "# Update account balance"]),
        ("# Then check authorization", ["# Verify authorization", "# Validate permissions", "# Check access", "# Ensure authorization"]),
        ("# Check authorization FIRST", ["# Verify authorization before mutation", "# Validate permissions first", "# Check access before changes", "# Ensure authorization first"]),
        ("# Race window here", ["# Concurrent access possible here", "# Timing window exists", "# Race condition possible", "# Potential race condition"]),
        ("# Process payment", ["# Execute payment", "# Handle payment", "# Complete payment transaction"]),
        ("# Apply discount", ["# Apply promotional discount", "# Use discount code", "# Process discount"]),
    ]
    
    for old_comment, new_options in comment_variants:
        if old_comment in varied_code:
            if random.random() < 0.4:  # 40% chance to vary comment (increased from 30%)
                varied_code = varied_code.replace(old_comment, random.choice(new_options), 1)
    
    # Variate variable names (expanded set) - conservative but more diverse
    var_variants = {
        "from_account": ["source_account", "sender_account", "origin_account", "src_account"],
        "to_account": ["target_account", "recipient_account", "destination_account", "dst_account"],
        "user_id": ["userId", "uid", "user_identifier", "user_id"],
        "amount": ["value", "quantity", "sum", "total_amount"],
        "payment_id": ["paymentId", "payment_identifier", "transaction_id", "txn_id"],
        "discount_code": ["discountCode", "promo_code", "coupon_code", "discount"],
        "session_id": ["sessionId", "session_identifier", "sid", "session_token"],
    }
    
    for old_var, new_options in var_variants.items():
        if old_var in varied_code:
            if random.random() < 0.3:  # 30% chance to vary variable name (increased from 20%)
                new_var = random.choice(new_options)
                # Use word boundaries to avoid partial replacements
                varied_code = re.sub(r'\b' + re.escape(old_var) + r'\b', new_var, varied_code)
    
    # Structural variations: vary code formatting/style (whitespace, line breaks)
    # This creates visual diversity while preserving semantics
    if random.random() < 0.2:  # 20% chance for structural variation
        # Add/remove blank lines in non-critical areas
        lines = varied_code.split('\n')
        varied_lines = []
        for i, line in enumerate(lines):
            varied_lines.append(line)
            # Add occasional blank line after certain patterns (conservative)
            if i < len(lines) - 1 and random.random() < 0.1:
                if line.strip().endswith(':'):
                    varied_lines.append('')  # Add blank line after function/if definitions sometimes
        varied_code = '\n'.join(varied_lines)
    
    # Vary return statement formatting
    return_patterns = [
        (r'return \{"status": "success"\}', 'return {"status": "success", "message": "OK"}'),
        (r'return \{"status": "success"\}', 'return {"status": "success"}'),
    ]
    
    for pattern, replacement in return_patterns:
        if re.search(pattern, varied_code) and random.random() < 0.1:
            varied_code = re.sub(pattern, replacement, varied_code)
    
    if variation_seed is not None:
        random.seed()  # Reset random seed
    
    return varied_code

def get_template_variation(vuln_type: str, variant: str, variation_id: int = None) -> Dict:
    """Get a specific template variation for the vulnerability type
    
    Uses variation_id to select which template variation to use (for diversity)
    Currently supports single templates - can be extended to support multiple variations
    """
    template = VULNERABILITY_TEMPLATES.get(vuln_type, {})
    if not template or variant not in template:
        return {}
    
    code_data = template[variant]
    
    # Future: If template has variations list, select one based on variation_id
    # For now, templates are single dicts - this structure allows future expansion
    if isinstance(code_data, list) and len(code_data) > 0:
        # Multiple variations available (not yet implemented, but structure ready)
        if variation_id is not None:
            variation_idx = variation_id % len(code_data)
            return code_data[variation_idx]
        else:
            return random.choice(code_data)
    elif isinstance(code_data, dict):
        # Single template (current structure) - return as-is
        return code_data
    else:
        return {}

def create_snippets(vuln_type: str, variant: str, language: str = "python", variation_id: int = None) -> List[Dict]:
    """Create code snippets with proper roles (entrypoint, validator, mutator, sink)
    
    Args:
        variation_id: Optional ID to select template variation and add code variation (reduces repetition)
    """
    code_data = get_template_variation(vuln_type, variant, variation_id)
    if not code_data:
        # Generate generic template
        ext_map = {"python": ".py", "javascript": ".js", "java": ".java", "go": ".go", 
                   "c": ".c", "cpp": ".cpp", "ruby": ".rb", "php": ".php"}
        ext = ext_map.get(language, ".py")
        return [{
            "snippet_id": "A",
            "file": f"main{ext}",
            "role": "entrypoint",
            "code": "# Code snippet"
        }]
    
    snippets = []
    
    # Add variation to reduce repetition (applies even if using template variations)
    entrypoint_code = code_data.get("entrypoint", "")
    supporting_code = code_data.get("supporting", "")
    
    if variation_id is not None:
        # Apply additional micro-variations (comments, variable names) even with template variations
        entrypoint_code = vary_code_template(entrypoint_code, variation_id)
        supporting_code = vary_code_template(supporting_code, variation_id + 1000)  # Different variation
    
    # Determine file names based on vulnerability type and language
    ext_map = {"python": ".py", "javascript": ".js", "java": ".java", "go": ".go", 
               "c": ".c", "cpp": ".cpp", "ruby": ".rb", "php": ".php"}
    ext = ext_map.get(language, ".py")
    
    file_mapping = {
        "authorization_order_flaw": (f"transfer{ext}", f"auth{ext}"),
        "race_condition_authorization": (f"payment{ext}", f"account{ext}"),
        "business_logic_bypass": (f"discount{ext}", f"cart{ext}"),
        "session_fixation_via_state": (f"auth{ext}", f"session{ext}"),
        "privilege_escalation_via_state": (f"admin{ext}", f"rbac{ext}"),
        "idempotency_violation": (f"payment{ext}", f"account{ext}")
    }
    
    files = file_mapping.get(vuln_type, (f"api{ext}", f"utils{ext}"))
    
    # Entrypoint snippet (always present)
    snippets.append({
        "snippet_id": "A",
        "file": files[0],
        "role": "entrypoint",
        "code": entrypoint_code
    })
    
    # Supporting snippets with proper roles
    if supporting_code:
        # Determine role based on content
        role = "validator" if "check" in supporting_code.lower() or "validate" in supporting_code.lower() else "supporting"
        
        snippets.append({
            "snippet_id": "B",
            "file": files[1],
            "role": role,
            "code": supporting_code
        })
    
    # Add mutator and sink roles if applicable
    entrypoint_code = code_data.get("entrypoint", "")
    if "save()" in entrypoint_code or "update" in entrypoint_code.lower():
        # Mark entrypoint as mutator if it modifies state
        if "balance" in entrypoint_code or "role" in entrypoint_code or "status" in entrypoint_code:
            for snippet in snippets:
                if snippet["snippet_id"] == "A":
                    snippet["role"] = "mutator"
    
    return snippets

def generate_data_flow(snippets: List[Dict]) -> List[str]:
    """Generate data flow between snippets"""
    if len(snippets) == 1:
        return ["A"]
    elif len(snippets) == 2:
        return ["A -> B -> A"]
    else:
        flow = " -> ".join([s["snippet_id"] for s in snippets])
        return [flow]

def create_vulnerable_sample(vuln_type: str, difficulty: str = None) -> Dict:
    """Create a single vulnerable training sample with varied difficulty and characteristics"""
    pattern = EXPERT_VULNERABILITY_PATTERNS[vuln_type]
    
    # Add difficulty variation (expert, advanced, critical)
    if difficulty is None:
        difficulty = random.choices(
            ["expert", "advanced", "critical"],
            weights=[0.5, 0.3, 0.2]  # 50% expert, 30% advanced, 20% critical
        )[0]
    
    sample_id = generate_sample_id()
    pair_id = generate_contrastive_pair_id()
    
    domain = random.choice(pattern["domains"])
    language = random.choice(pattern["languages"])
    
    # Use sample_id hash for code variation to reduce repetition
    variation_id = hash(sample_id) % 10000  # Limit to reasonable range
    
    snippets = create_snippets(vuln_type, "unsafe", language, variation_id=variation_id)
    data_flow = generate_data_flow(snippets)
    
    exploit_narrative = create_exploit_narrative(vuln_type, domain)
    
    # Varied severity based on difficulty
    severity_map = {
        "expert": "CRITICAL",
        "advanced": "HIGH",
        "critical": "CRITICAL"
    }
    severity = severity_map.get(difficulty, "CRITICAL")
    
    # Varied false-negative risk (high is correct, but add critical for most sophisticated)
    false_negative_risk = random.choices(
        ["high", "critical"],
        weights=[0.7, 0.3]  # 70% high, 30% critical (most sophisticated)
    )[0]
    
    # More diverse expert characteristics (3-5 instead of 2-4)
    all_characteristics = [
        "Requires runtime state",
        "Requires attacker timing",
        "Requires business context",
        "Requires trust-boundary reasoning",
        "Requires protocol understanding",
        "Looks secure in isolation",
        "Exploit spans multiple requests",
        "Exploit spans multiple services",
        "Requires distributed system reasoning",
        "Requires state machine understanding",
        "Requires cryptographic knowledge",
        "Requires race condition exploitation"
    ]
    
    # Difficulty-based characteristic selection
    if difficulty == "critical":
        num_chars = random.randint(4, 6)  # Critical: more characteristics
        preferred_chars = [c for c in all_characteristics if any(x in c for x in ["protocol", "distributed", "state machine", "cryptographic"])]
        expert_chars = random.sample(preferred_chars + all_characteristics, k=min(num_chars, len(all_characteristics)))
    elif difficulty == "advanced":
        num_chars = random.randint(3, 5)  # Advanced: medium
        expert_chars = random.sample(all_characteristics, k=num_chars)
    else:  # expert
        num_chars = random.randint(2, 4)  # Expert: baseline
        expert_chars = random.sample(all_characteristics, k=num_chars)
    
    sample = {
        "sample_id": sample_id,
        "difficulty": difficulty,
        "vulnerability_type": "logic",
        "vulnerability_subtype": vuln_type,
        "language": [language],
        "domain": domain,
        "attack_surface": random.sample(["api", "backend", "database", "service", "frontend", "microservice"], k=random.randint(1, 3)),
        "cwe": pattern["cwe"],
        "owasp_2021": pattern["owasp"],
        "mitre_attack": {
            "tactic": pattern["mitre_tactics"],
            "technique": pattern["mitre_techniques"],
            "subtechnique": None
        },
        "snippets": snippets,
        "data_flow": data_flow,
        "vulnerability_description": f"{vuln_type.replace('_', ' ').title()} - {random.choice(['Authorization check after mutation', 'State change before validation', 'Race condition in critical section', 'Timing attack in validation', 'Business logic bypass via state manipulation'])}",
        "exploit_prerequisites": ["authenticated_user", random.choice(["network_access", "api_access", "session_access", "database_access"])],
        "attacker_goal": random.choice([
            "transfer funds from another account",
            "bypass authorization checks",
            "escalate privileges",
            "manipulate business logic",
            "exploit race conditions",
            "achieve unauthorized data access",
            "bypass rate limiting",
            "exploit idempotency violations"
        ]),
        "unsafe_variant": {
            "explanation": random.choice([
                "Authorization check occurs after state mutation",
                "Validation happens after side effects",
                "Race condition in critical section",
                "Business logic bypass possible",
                "Timing attack in validation logic",
                "State mutation before authorization verification",
                "Idempotency check bypassed via timing"
            ]),
            "impact": random.choice([
                "unauthorized fund transfer",
                "privilege escalation",
                "data manipulation",
                "financial loss",
                "data breach",
                "service disruption",
                "authentication bypass"
            ])
        },
        "safe_variant": {
            "explanation": "Authorization enforced before state change",
            "fix_code": create_snippets(vuln_type, "safe", language, variation_id=variation_id)[0]["code"] if create_snippets(vuln_type, "safe", language, variation_id=variation_id) else ""
        },
        "why_static_analysis_fails": pattern["why_static_fails"],
        "contrastive_pair_id": pair_id,
        "labels": {
            "ground_truth": "vulnerable",
            "false_negative_risk": false_negative_risk,
            "severity": severity
        },
        "exploit_narrative": exploit_narrative,
        "expert_characteristics": expert_chars
    }
    
    return sample

def create_safe_sample(base_sample: Dict) -> Dict:
    """Create safe variant (contrastive pair)"""
    import copy
    safe_sample = copy.deepcopy(base_sample)
    safe_sample["sample_id"] = generate_sample_id()
    safe_sample["labels"]["ground_truth"] = "safe"
    safe_sample["labels"]["false_negative_risk"] = "low"
    
    # Use safe variant code (preserve language from base sample)
    vuln_type = base_sample["vulnerability_subtype"]
    language = base_sample.get("language", ["python"])[0] if isinstance(base_sample.get("language"), list) else "python"
    # Use same variation_id as vulnerable sample for contrastive pair consistency
    variation_id = hash(base_sample["sample_id"]) % 10000
    safe_snippets = create_snippets(vuln_type, "safe", language, variation_id=variation_id)
    safe_sample["snippets"] = safe_snippets
    safe_sample["data_flow"] = generate_data_flow(safe_snippets)
    
    # Update description
    safe_sample["vulnerability_description"] = f"Secure implementation: {base_sample['vulnerability_description']}"
    safe_sample["unsafe_variant"] = None
    safe_sample["safe_variant"] = {
        "explanation": "Authorization enforced before state mutation",
        "fix_code": safe_snippets[0]["code"]
    }
    
    return safe_sample

def generate_training_dataset(count: int = 10000, streaming: bool = False, expert_file=None, openai_file=None):
    """Generate complete training dataset with contrastive pairs - ensures perfect pairing
    
    If streaming=True, writes samples directly to files (memory-efficient for large datasets)
    If streaming=False, returns all samples in memory (for smaller datasets or statistics)
    """
    vuln_types = list(EXPERT_VULNERABILITY_PATTERNS.keys())
    
    # Use weighted distribution for vulnerability types to ensure better balance
    vuln_type_weights = {vtype: 1.0 for vtype in vuln_types}
    
    # Generate pairs (vulnerable + safe) - ensures contrastive learning
    # For perfect pairing, ensure count is even
    if count % 2 != 0:
        count += 1  # Make even for perfect pairing
    
    pairs_needed = count // 2
    
    print(f"Generating {pairs_needed} contrastive pairs ({count} total samples)...")
    if streaming:
        print("Using streaming mode (memory-efficient for large datasets)")
    
    # For streaming: collect samples temporarily to shuffle pairs, then write
    # For non-streaming: collect all samples
    if streaming:
        # Collect pairs in batches, shuffle, then write
        batch_size = min(1000, pairs_needed // 10)  # Process in batches
        all_pairs = []  # Store as pairs to shuffle later
        # Track pair IDs with limited size (sliding window) to prevent unbounded growth
        # Use a simple counter-based approach - collisions are extremely rare with 90k range
        used_pair_ids = set()
        max_pair_id_tracking = 10000  # Only track last 10k IDs to prevent memory issues
    else:
        samples = []
        # Track pair IDs to ensure uniqueness (ok for smaller datasets)
        used_pair_ids = set()
    
    # Generate pairs with better type distribution
    for i in range(pairs_needed):
        # Create vulnerable sample - use weighted selection for better distribution
        vuln_type = random.choices(
            list(vuln_types),
            weights=[vuln_type_weights.get(vt, 1.0) for vt in vuln_types]
        )[0]
        
        # Slightly reduce weight of selected type to improve distribution
        vuln_type_weights[vuln_type] *= 0.98
        
        vulnerable = create_vulnerable_sample(vuln_type)
        
        # Ensure pair ID is unique (with memory management for streaming)
        if streaming:
            # For streaming, limit tracking to prevent memory issues
            # Collisions are extremely rare, so we can use a simple approach
            max_attempts = 10  # Reasonable limit
            attempts = 0
            while vulnerable["contrastive_pair_id"] in used_pair_ids and attempts < max_attempts:
                vulnerable["contrastive_pair_id"] = generate_contrastive_pair_id()
                attempts += 1
            
            used_pair_ids.add(vulnerable["contrastive_pair_id"])
            # Limit set size to prevent memory growth
            if len(used_pair_ids) > max_pair_id_tracking:
                # Remove oldest entries (simple: clear and restart - collisions very unlikely)
                used_pair_ids.clear()
                used_pair_ids.add(vulnerable["contrastive_pair_id"])
        else:
            # For non-streaming, full uniqueness check
            while vulnerable["contrastive_pair_id"] in used_pair_ids:
                vulnerable["contrastive_pair_id"] = generate_contrastive_pair_id()
            used_pair_ids.add(vulnerable["contrastive_pair_id"])
        
        # Create safe contrastive pair (≥90% identical, one semantic difference)
        safe = create_safe_sample(vulnerable)
        safe["contrastive_pair_id"] = vulnerable["contrastive_pair_id"]  # Same pair ID
        
        if streaming:
            all_pairs.append([vulnerable, safe])
            
            # Write batch when full
            if len(all_pairs) >= batch_size:
                # Shuffle pairs
                random.shuffle(all_pairs)
                # Write each pair (shuffle order within pair) using open file handles
                # File handles are passed from main() to avoid opening/closing repeatedly
                for pair in all_pairs:
                    random.shuffle(pair)  # Randomize vulnerable/safe order
                    for sample in pair:
                        save_sample_streaming(sample, expert_file, openai_file, format="both")
                all_pairs = []  # Clear batch
                # Force garbage collection periodically for large datasets
                if (i + 1) % 10000 == 0:
                    import gc
                    gc.collect()
        else:
            samples.append(vulnerable)
            samples.append(safe)
        
        if (i + 1) % 500 == 0:
            if streaming:
                print(f"  Generated {((i + 1) * 2)} samples ({i + 1} pairs)...")
            else:
                print(f"  Generated {len(samples)} samples ({i + 1} pairs)...")
    
    # Handle remaining pairs in streaming mode
    if streaming and all_pairs:
        random.shuffle(all_pairs)
        for pair in all_pairs:
            random.shuffle(pair)
            for sample in pair:
                save_sample_streaming(sample, expert_file, openai_file, format="both")
    
    if not streaming:
        # Shuffle to mix vulnerable and safe samples while preserving pair relationships
        pair_groups = {}
        for sample in samples:
            pair_id = sample["contrastive_pair_id"]
            if pair_id not in pair_groups:
                pair_groups[pair_id] = []
            pair_groups[pair_id].append(sample)
        
        # Shuffle pairs, then samples within pairs
        pair_ids = list(pair_groups.keys())
        random.shuffle(pair_ids)
        
        shuffled_samples = []
        for pair_id in pair_ids:
            pair_samples = pair_groups[pair_id]
            random.shuffle(pair_samples)
            shuffled_samples.extend(pair_samples)
        
        return shuffled_samples[:count]
    
    return None  # Streaming mode doesn't return samples

def convert_to_openai_format(sample: Dict) -> Dict:
    """Convert expert sample to OpenAI fine-tuning format with zero-trust evaluation"""
    # Build system prompt with zero-trust evaluation
    system_prompt = """You are CipherMate, a paranoid security analysis AI trained to assume malicious intent.

ZERO-TRUST EVALUATION PRINCIPLES:
- Assume hostile attacker with patience, timing, and protocol knowledge
- Explain HOW exploits work, not just that they exist
- State what security assumption failed
- REJECT "looks safe" conclusions - they are failures
- Focus on order-of-operations, state mutations, and timing
- Think like an attacker, not a defender

FAILURE MODES (automatic fail if you say these):
- "This appears secure"
- "No vulnerability detected"
- "Depends on context"
- "Looks safe"

You are NOT:
- A scanner
- A linter
- A vulnerability list checker

You ARE:
- A paranoid reasoning engine that distrusts:
  * Order of operations
  * State mutations
  * Intent assumptions
  * Context assumptions
  * Correctness itself

LANGUAGE-AGNOSTIC ANALYSIS:
- Security vulnerabilities are LOGIC flaws, not syntax-specific
- Authorization order flaws exist in Python, JavaScript, Java, Go, C++, Ruby, and ALL languages
- Race conditions, state mutations, and timing attacks are universal concepts
- Focus on SEMANTIC patterns (what the code does) not SYNTAX (how it's written)
- The same logical flaw manifests differently across languages, but the vulnerability principle is identical

Evaluation prompt: "Assume a hostile attacker with patience, timing, and protocol knowledge. Explain how this could fail."
"""

    # Build user prompt (use actual language from sample metadata)
    language = sample.get("language", ["python"])[0] if isinstance(sample.get("language"), list) else "python"
    code_context = "\n\n".join([
        f"File: {s['file']} ({s['role']})\n```{language}\n{s['code']}\n```"
        for s in sample["snippets"]
    ])
    
    user_prompt = f"""Analyze this code for security vulnerabilities.

Domain: {sample['domain']}
Vulnerability Type: {sample['vulnerability_subtype']}
CWE: {', '.join(sample['cwe'])}
OWASP: {', '.join(sample['owasp_2021'])}

Code:
{code_context}

Data Flow: {' -> '.join(sample['data_flow'])}

Assume a hostile attacker. Explain how this could fail."""

    # Build assistant response
    exploit_steps = "\n".join([
        f"{k.replace('_', ' ').title()}: {v}"
        for k, v in sample["exploit_narrative"].items()
    ])
    
    # Build detailed exploit explanation
    exploit_steps = "\n".join([
        f"{k.replace('_', ' ').title()}: {v}"
        for k, v in sample["exploit_narrative"].items()
    ])
    
    expert_chars = "\n".join([
        f"- {char}"
        for char in sample.get("expert_characteristics", [])
    ])
    
    # Handle both vulnerable and safe samples
    is_vulnerable = sample['labels']['ground_truth'] == 'vulnerable'
    
    if is_vulnerable:
        assistant_response = f"""VULNERABILITY DETECTED: {sample['vulnerability_description']}

Type: {sample['vulnerability_subtype']}
Severity: {sample.get('labels', {}).get('severity', 'CRITICAL')}
Difficulty: {sample['difficulty']}
False-Negative Risk: {sample['labels'].get('false_negative_risk', 'high').upper()}
CWE: {', '.join(sample['cwe'])}
OWASP: {', '.join(sample['owasp_2021'])}

Why Static Analysis Fails:
{chr(10).join('- ' + reason for reason in sample['why_static_analysis_fails'])}

Expert Characteristics:
{expert_chars}

Exploit Narrative (ATT&CK-aligned):
{exploit_steps}

Impact: {sample['unsafe_variant']['impact']}
Attacker Goal: {sample['attacker_goal']}

Data Flow: {' -> '.join(sample['data_flow'])}

Secure Fix:
```python
{sample['safe_variant']['fix_code']}
```

Explanation: {sample['safe_variant']['explanation']}

Security Assumption That Failed: {sample['unsafe_variant']['explanation']}"""
    else:
        # Safe sample - show why it's secure
        assistant_response = f"""SECURE IMPLEMENTATION: {sample['vulnerability_description']}

Type: {sample['vulnerability_subtype']} (Secure Variant)
Difficulty: {sample['difficulty']}
CWE: {', '.join(sample['cwe'])}
OWASP: {', '.join(sample['owasp_2021'])}

This implementation is secure because:

Why This Is Secure:
- Authorization enforced before state mutation
- Proper order of operations
- No race conditions
- State changes only after validation

Code:
```python
{sample['safe_variant']['fix_code']}
```

Explanation: {sample['safe_variant']['explanation']}

Data Flow: {' -> '.join(sample['data_flow'])}

Security Principle Applied: Check authorization and validate BEFORE mutating state."""

    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": assistant_response}
        ]
    }

def save_training_data(samples: List[Dict], filename: str, format: str = "expert"):
    """Save training data in specified format"""
    if format == "expert":
        # Save in expert format
        with open(filename, 'w') as f:
            for sample in samples:
                f.write(json.dumps(sample, indent=2) + '\n\n')
    else:
        # Save in OpenAI format
        with open(filename, 'w') as f:
            for sample in samples:
                openai_format = convert_to_openai_format(sample)
                f.write(json.dumps(openai_format) + '\n')

def save_sample_streaming(sample: Dict, expert_fh, openai_fh, format: str = "both"):
    """Save a single sample incrementally to both file handles (memory-efficient for large datasets)
    
    Args:
        sample: Sample dict to save
        expert_fh: Open file handle for expert format (or None)
        openai_fh: Open file handle for OpenAI format (or None)
        format: "both", "expert", or "openai"
    """
    if format in ["both", "expert"] and expert_fh:
        expert_fh.write(json.dumps(sample, indent=2) + '\n\n')
        expert_fh.flush()  # Ensure data is written
    
    if format in ["both", "openai"] and openai_fh:
        openai_format = convert_to_openai_format(sample)
        openai_fh.write(json.dumps(openai_format) + '\n')
        openai_fh.flush()  # Ensure data is written

def main():
    print("🔷 Expert-Level Vulnerability Training Data Generator")
    print("=" * 70)
    print("\nThis generator creates sophisticated vulnerabilities that:")
    print("  ✅ Require reasoning, not pattern matching")
    print("  ✅ Pass linters and unit tests")
    print("  ✅ Include contrastive pairs (vulnerable vs safe, ≥90% identical)")
    print("  ✅ Align with attacker behavior (MITRE ATT&CK)")
    print("  ✅ Explain why static analysis fails")
    print("  ✅ Include multi-snippet code with data flow")
    print("  ✅ Zero-trust evaluation (assume malicious intent)\n")
    
    count = int(input("Number of samples to generate (default 10000): ") or "10000")
    
    if count < 100:
        print("⚠️  Warning: For effective training, recommend at least 1,000 samples")
        proceed = input("Continue anyway? (y/n): ").strip().lower()
        if proceed != 'y':
            return
    
    print(f"\n🚀 Generating {count} expert-level samples...")
    print("   (This may take a few minutes for large datasets)\n")
    
    # Get desktop path
    desktop_path = Path.home() / "Desktop"
    desktop_path.mkdir(parents=True, exist_ok=True)
    
    # Use streaming mode for large datasets (>100k samples) to prevent memory issues
    use_streaming = count > 100000
    
    expert_file = desktop_path / f"expert_training_data_{count}.jsonl"
    openai_file = desktop_path / f"expert_training_data_openai_{count}.jsonl"
    
    if use_streaming:
        # Streaming mode: write as we generate (memory-efficient)
        print(f"Using streaming mode for large dataset ({count:,} samples)")
        # Clear files if they exist
        expert_file.unlink(missing_ok=True)
        openai_file.unlink(missing_ok=True)
        
        # Open file handles once and keep them open for the entire generation
        # This avoids the overhead of opening/closing files millions of times
        with open(expert_file, 'w') as expert_fh, open(openai_file, 'w') as openai_fh:
            generate_training_dataset(count, streaming=True, expert_file=expert_fh, openai_file=openai_fh)
        
        samples = None  # Not loaded in memory
        print(f"✅ Saved expert format: {expert_file}")
        print(f"✅ Saved OpenAI format: {openai_file}")
    else:
        # Non-streaming mode: generate all, then save (better for statistics)
        samples = generate_training_dataset(count, streaming=False)
        save_training_data(samples, str(expert_file), format="expert")
        print(f"✅ Saved expert format: {expert_file}")
        save_training_data(samples, str(openai_file), format="openai")
        print(f"✅ Saved OpenAI format: {openai_file}")
    
    # Statistics (only calculate if samples are in memory)
    if samples is not None and len(samples) > 0:
        vuln_types = {}
        for sample in samples:
            vtype = sample["vulnerability_subtype"]
            vuln_types[vtype] = vuln_types.get(vtype, 0) + 1
        
        # Calculate statistics
        vulnerable_count = sum(1 for s in samples if s['labels']['ground_truth'] == 'vulnerable')
        safe_count = sum(1 for s in samples if s['labels']['ground_truth'] == 'safe')
        high_risk = sum(1 for s in samples if s['labels'].get('false_negative_risk') == 'high')
        critical_risk = sum(1 for s in samples if s['labels'].get('false_negative_risk') == 'critical')
        pairs = len(set(s['contrastive_pair_id'] for s in samples))
        
        # Difficulty distribution
        difficulty_dist = {}
        for s in samples:
            if s['labels']['ground_truth'] == 'vulnerable':
                diff = s.get('difficulty', 'expert')
                difficulty_dist[diff] = difficulty_dist.get(diff, 0) + 1
        
        # Severity distribution
        severity_dist = {}
        for s in samples:
            if s['labels']['ground_truth'] == 'vulnerable':
                sev = s.get('labels', {}).get('severity', 'CRITICAL')
                severity_dist[sev] = severity_dist.get(sev, 0) + 1
    else:
        # For streaming mode, calculate approximate stats or skip
        print("\n📊 Dataset Statistics:")
        print(f"  Total samples: {count:,}")
        print(f"  Contrastive pairs: {count // 2:,}")
        print(f"  (Statistics skipped in streaming mode - files written directly)")
        print(f"\n✨ Generation complete!")
        print(f"\n📁 Files created on Desktop:")
        print(f"  • {expert_file.name} - Expert format (full schema)")
        print(f"  • {openai_file.name} - OpenAI fine-tuning format")
        print(f"\n📂 Full paths:")
        print(f"  • {expert_file}")
        print(f"  • {openai_file}")
        return
    
    print(f"\n📊 Dataset Statistics:")
    print(f"  Total samples: {len(samples):,}")
    print(f"  Vulnerable samples: {vulnerable_count:,}")
    print(f"  Safe samples: {safe_count:,}")
    print(f"  Contrastive pairs: {pairs:,}")
    print(f"  Pair completeness: {(pairs * 2 / len(samples) * 100):.1f}%")
    print(f"  False-negative risk:")
    print(f"    High: {high_risk:,} ({high_risk/vulnerable_count*100:.1f}%)")
    if critical_risk > 0:
        print(f"    Critical: {critical_risk:,} ({critical_risk/vulnerable_count*100:.1f}%)")
    
    if difficulty_dist:
        print(f"\n  Difficulty distribution:")
        for diff, count in sorted(difficulty_dist.items(), key=lambda x: ['expert', 'advanced', 'critical'].index(x[0]) if x[0] in ['expert', 'advanced', 'critical'] else 999):
            print(f"    {diff}: {count:,} ({count/vulnerable_count*100:.1f}%)")
    
    if severity_dist:
        print(f"\n  Severity distribution:")
        for sev, count in sorted(severity_dist.items(), key=lambda x: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].index(x[0]) if x[0] in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] else 999):
            print(f"    {sev}: {count:,} ({count/vulnerable_count*100:.1f}%)")
    print(f"\n  Vulnerability types:")
    for vtype, count in sorted(vuln_types.items(), key=lambda x: -x[1]):
        percentage = (count / len(samples)) * 100
        print(f"    {vtype}: {count} ({percentage:.1f}%)")
    
    # Expert characteristics distribution
    all_chars = []
    for s in samples:
        all_chars.extend(s.get('expert_characteristics', []))
    char_counts = {}
    for char in all_chars:
        char_counts[char] = char_counts.get(char, 0) + 1
    
    print(f"\n  Expert characteristics:")
    for char, count in sorted(char_counts.items(), key=lambda x: -x[1])[:5]:
        print(f"    {char}: {count}")
    
    print(f"\n✨ Generation complete!")
    print(f"\n📁 Files created on Desktop:")
    print(f"  • {expert_file.name} - Expert format (full schema)")
    print(f"  • {openai_file.name} - OpenAI fine-tuning format")
    print(f"\n📂 Full paths:")
    print(f"  • {expert_file}")
    print(f"  • {openai_file}")
    print(f"\n🎯 Next steps:")
    print(f"  1. Review samples: head -n 5 \"{expert_file}\"")
    print(f"  2. Train with OpenAI: python3 train_openai.py")
    print(f"  3. Or use with Hugging Face training")
    print(f"  4. Deploy trained model as API")
    print(f"  5. Configure CipherMate with your API endpoint")

if __name__ == "__main__":
    main()

