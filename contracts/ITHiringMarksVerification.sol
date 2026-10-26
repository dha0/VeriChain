// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITHiringMarksVerification
 * @dev Decentralized Academic Marks, Credentials, and Skill Verification System for IT Hiring.
 * Features:
 *  - Role-based Access Control (Admin, Accredited College/University, Authorized Company, Candidate)
 *  - Authorized Relayer Architecture: all write functions accept calls ONLY from the authorized relayer
 *  - College Binding: Every college stores its 2-letter college code and affiliating university
 *  - USN Format Verification: 1 digit + 2-letter college code + 2-digit year + 2-letter branch + 3 digits
 *  - Cryptographic Marks Privacy: Stores only cryptographic hashes on-chain (bytes32 marksHash), no plaintext marks/percentages
 *  - Full Credential Lifecycle Management (Active, Suspended, Reactivated, Revoked)
 *  - Strict College Ownership: Student actions and credentials strictly tied to their respective college
 *  - Tamper-proof Document Integrity via SHA-256 (bytes32) Cryptographic Hash Matching
 *  - Content-Addressed Encrypted PDF Pinning via IPFS (CID)
 *  - Student Self-Uploaded Achievement Portfolio with College Endorsement Workflow
 *  - Institutional Access Request Queue governed by Admin
 *  - Two-Tier Verification Engine & Permanent On-Chain Audit Trail
 */
contract ITHiringMarksVerification {

    // =====================================================
    // ENUMS
    // =====================================================

    enum CredentialStatus {
        Active,     // 0: Credential is valid, authentic, and recognized
        Revoked,    // 1: Permanently invalidated by issuing College
        Suspended,  // 2: Temporarily inactive (Under institutional investigation)
        Expired     // 3: Passed its validity date
    }

    enum AchievementStatus {
        PendingReview, // 0: Student submitted, pending college review
        Verified,      // 1: College verified as authentic and legitimate skill
        Rejected       // 2: College rejected with remarks
    }

    // =====================================================
    // STRUCTURES
    // =====================================================

    struct University {
        uint256 id;
        string name;
        string universityCode;         // College code (e.g. "RV")
        string affiliatingUniversity;   // Affiliating university (e.g. "VTU")
        address wallet;
        bool active;
    }

    struct Student {
        uint256 id;
        string usn;
        string name;
        string course;
        uint16 graduationYear;
        bytes32 marksHash;             // Cryptographic hash of marks/percentage (no plaintext on-chain)
        uint256 universityId;          // College ID to which student is permanently bound
        bool exists;
    }

    struct Credential {
        uint256 credentialId;
        uint256 studentId;
        uint256 universityId;
        string documentType;           // "Degree Certificate", "Marksheet", "Academic Transcript", etc.
        bytes32 documentHash;          // SHA-256 hash of original unencrypted document
        string ipfsCID;                // IPFS CID where encrypted PDF / marksheet payload is stored
        uint256 issuedAt;              // Block timestamp
        uint256 version;               // Credential version (1, 2, ...)
        CredentialStatus status;
        bool exists;
    }

    struct Achievement {
        uint256 achievementId;
        uint256 studentId;
        string title;
        string issuerOrg;
        string category;               // "Hackathon", "Certification", "Research", "Skill Badge"
        bytes32 documentHash;          // SHA-256 hash
        string ipfsCID;                // IPFS CID
        uint256 submittedAt;
        uint256 reviewedAt;
        uint256 reviewingUniversityId;
        AchievementStatus status;
        string reviewRemarks;
        bool exists;
    }

    struct Company {
        uint256 id;
        string name;
        string companyCode;
        address wallet;
        bool active;
    }

    struct Verification {
        uint256 verificationId;
        uint256 credentialId;
        uint256 companyId;
        string documentType;
        bool hashMatched;              // True if uploaded hash matches blockchain hash
        bool verified;                 // True if hash matched AND credential Active AND College Active
        uint256 timestamp;
    }

    struct AccessRequest {
        uint256 requestId;
        string entityType;             // "university" or "company"
        string name;
        string proposedCode;
        string contactEmail;
        address wallet;
        bool approved;
        uint256 timestamp;
    }

    // =====================================================
    // STATE STORAGE & COUNTERS
    // =====================================================

    address public admin;
    address public authorizedRelayer;

    uint256 private universityCounter;
    uint256 private studentCounter;
    uint256 private credentialCounter;
    uint256 private achievementCounter;
    uint256 private companyCounter;
    uint256 private verificationCounter;
    uint256 private accessRequestCounter;

    // Primary Entity Storage
    mapping(uint256 => University) public universities;
    mapping(uint256 => Student) public students;
    mapping(uint256 => Credential) public credentials;
    mapping(uint256 => Achievement) public achievements;
    mapping(uint256 => Company) public companies;
    mapping(uint256 => Verification) public verifications;
    mapping(uint256 => AccessRequest) public accessRequests;

    // Secondary Lookup & Uniqueness Mappings
    mapping(string => uint256) public usnToStudentId;
    mapping(address => uint256) public universityAddressToId;
    mapping(address => uint256) public companyAddressToId;
    mapping(string => uint256) public universityCodeToId;
    mapping(string => uint256) public companyCodeToId;

    // Relational Mappings
    mapping(uint256 => uint256[]) private studentToCredentials;
    mapping(uint256 => uint256[]) private studentToAchievements;
    mapping(uint256 => uint256[]) private companyToVerifications;
    mapping(uint256 => uint256[]) private credentialToVerifications;

    // =====================================================
    // EVENTS
    // =====================================================

    event AuthorizedRelayerUpdated(address indexed newRelayer);

    event UniversityRegistered(
        uint256 indexed universityId,
        string name,
        string universityCode,
        string affiliatingUniversity,
        address indexed wallet
    );
    event UniversityStatusChanged(uint256 indexed universityId, bool active);

    event CompanyRegistered(uint256 indexed companyId, string name, string companyCode, address indexed wallet);
    event CompanyStatusChanged(uint256 indexed companyId, bool active);

    event StudentRegistered(
        uint256 indexed studentId,
        string indexed usn,
        string name,
        uint256 indexed universityId,
        bytes32 marksHash
    );

    event StudentMarksUpdated(
        uint256 indexed studentId,
        string indexed usn,
        uint256 indexed universityId,
        bytes32 oldMarksHash,
        bytes32 newMarksHash,
        uint256 timestamp
    );

    event CredentialIssued(
        uint256 indexed credentialId,
        uint256 indexed studentId,
        uint256 indexed universityId,
        string documentType,
        bytes32 documentHash,
        string ipfsCID,
        uint256 version
    );

    event CredentialSuspended(uint256 indexed credentialId, uint256 indexed universityId, string reason);
    event CredentialReactivated(uint256 indexed credentialId, uint256 indexed universityId);
    event CredentialRevoked(uint256 indexed credentialId, uint256 indexed universityId, string reason);
    event CredentialStatusChanged(uint256 indexed credentialId, CredentialStatus newStatus);

    event AchievementSubmitted(uint256 indexed achievementId, uint256 indexed studentId, string title);
    event AchievementReviewed(
        uint256 indexed achievementId,
        uint256 indexed universityId,
        AchievementStatus status,
        string remarks
    );

    event AccessRequested(uint256 indexed requestId, string entityType, string name, string proposedCode);
    event AccessRequestApproved(uint256 indexed requestId, string entityType, uint256 newEntityId);

    event CredentialVerified(
        uint256 indexed verificationId,
        uint256 indexed credentialId,
        uint256 indexed companyId,
        string documentType,
        bool hashMatched,
        bool verified,
        uint256 timestamp
    );

    // =====================================================
    // MODIFIERS
    // =====================================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "Auth: Only platform admin allowed");
        _;
    }

    modifier onlyAuthorizedRelayer() {
        require(msg.sender == authorizedRelayer, "Auth: Only authorized relayer allowed");
        _;
    }

    // =====================================================
    // CONSTRUCTOR
    // =====================================================

    constructor() {
        admin = msg.sender;
        authorizedRelayer = msg.sender;
    }

    // =====================================================
    // RELAYER CONFIGURATION (ADMIN ONLY)
    // =====================================================

    function setAuthorizedRelayer(address _relayer) external onlyAdmin {
        require(_relayer != address(0), "Validation: Zero address relayer");
        authorizedRelayer = _relayer;
        emit AuthorizedRelayerUpdated(_relayer);
    }

    // =====================================================
    // USN FORMAT PARSER & VALIDATOR (PURE SOL)
    // =====================================================

    /**
     * @dev Validates USN format: digit, 2-letter college code, 2-digit year, 2-letter branch, 3 digits
     * e.g. "1RV21CS001" -> extracts college code "RV"
     */
    function parseAndValidateUSN(string memory _usn) public pure returns (string memory collegeCode) {
        bytes memory b = bytes(_usn);
        require(b.length == 10, "Validation: USN must be exactly 10 characters");

        // Character 0: Digit (0-9)
        require(b[0] >= 0x30 && b[0] <= 0x39, "Validation: USN prefix must be a digit");

        // Characters 1..2: 2 uppercase letters for College Code (A-Z)
        require(b[1] >= 0x41 && b[1] <= 0x5A, "Validation: USN college code char 1 must be uppercase letter");
        require(b[2] >= 0x41 && b[2] <= 0x5A, "Validation: USN college code char 2 must be uppercase letter");

        // Characters 3..4: 2 digits for Admission Year (0-9)
        require(b[3] >= 0x30 && b[3] <= 0x39, "Validation: USN year char 1 must be a digit");
        require(b[4] >= 0x30 && b[4] <= 0x39, "Validation: USN year char 2 must be a digit");

        // Characters 5..6: 2 uppercase letters for Branch (A-Z)
        require(b[5] >= 0x41 && b[5] <= 0x5A, "Validation: USN branch char 1 must be uppercase letter");
        require(b[6] >= 0x41 && b[6] <= 0x5A, "Validation: USN branch char 2 must be uppercase letter");

        // Characters 7..9: 3 digits for Roll Number (0-9)
        require(b[7] >= 0x30 && b[7] <= 0x39, "Validation: USN roll number char 1 must be a digit");
        require(b[8] >= 0x30 && b[8] <= 0x39, "Validation: USN roll number char 2 must be a digit");
        require(b[9] >= 0x30 && b[9] <= 0x39, "Validation: USN roll number char 3 must be a digit");

        bytes memory codeBytes = new bytes(2);
        codeBytes[0] = b[1];
        codeBytes[1] = b[2];
        return string(codeBytes);
    }

    // =====================================================
    // 1. COLLEGE / UNIVERSITY MANAGEMENT (ADMIN ONLY)
    // =====================================================

    function registerUniversity(
        string memory _name,
        string memory _universityCode,
        string memory _affiliatingUniversity,
        address _wallet
    ) public onlyAdmin returns (uint256) {
        require(_wallet != address(0), "Validation: Zero address wallet");
        require(bytes(_name).length > 0, "Validation: Name cannot be empty");
        require(bytes(_universityCode).length > 0, "Validation: Code cannot be empty");
        require(universityAddressToId[_wallet] == 0, "Conflict: University wallet already registered");
        require(universityCodeToId[_universityCode] == 0, "Conflict: University code already registered");

        universityCounter++;
        uint256 newId = universityCounter;

        universities[newId] = University({
            id: newId,
            name: _name,
            universityCode: _universityCode,
            affiliatingUniversity: _affiliatingUniversity,
            wallet: _wallet,
            active: true
        });

        universityAddressToId[_wallet] = newId;
        universityCodeToId[_universityCode] = newId;

        emit UniversityRegistered(newId, _name, _universityCode, _affiliatingUniversity, _wallet);
        return newId;
    }

    // Overload for backward compatibility
    function registerUniversity(
        string memory _name,
        string memory _universityCode,
        address _wallet
    ) external onlyAdmin returns (uint256) {
        return registerUniversity(_name, _universityCode, "VTU", _wallet);
    }

    function deactivateUniversity(uint256 _id) external onlyAdmin {
        require(_id > 0 && _id <= universityCounter, "Validation: Invalid university ID");
        require(universities[_id].active, "State: University already inactive");
        universities[_id].active = false;
        emit UniversityStatusChanged(_id, false);
    }

    function activateUniversity(uint256 _id) external onlyAdmin {
        require(_id > 0 && _id <= universityCounter, "Validation: Invalid university ID");
        require(!universities[_id].active, "State: University already active");
        universities[_id].active = true;
        emit UniversityStatusChanged(_id, true);
    }

    // =====================================================
    // 2. COMPANY MANAGEMENT (ADMIN ONLY)
    // =====================================================

    function registerCompany(
        string memory _name,
        string memory _companyCode,
        address _wallet
    ) public onlyAdmin returns (uint256) {
        require(_wallet != address(0), "Validation: Zero address wallet");
        require(bytes(_name).length > 0, "Validation: Name cannot be empty");
        require(bytes(_companyCode).length > 0, "Validation: Code cannot be empty");
        require(companyAddressToId[_wallet] == 0, "Conflict: Company wallet already registered");
        require(companyCodeToId[_companyCode] == 0, "Conflict: Company code already registered");

        companyCounter++;
        uint256 newId = companyCounter;

        companies[newId] = Company({
            id: newId,
            name: _name,
            companyCode: _companyCode,
            wallet: _wallet,
            active: true
        });

        companyAddressToId[_wallet] = newId;
        companyCodeToId[_companyCode] = newId;

        emit CompanyRegistered(newId, _name, _companyCode, _wallet);
        return newId;
    }

    function deactivateCompany(uint256 _id) external onlyAdmin {
        require(_id > 0 && _id <= companyCounter, "Validation: Invalid company ID");
        require(companies[_id].active, "State: Company already inactive");
        companies[_id].active = false;
        emit CompanyStatusChanged(_id, false);
    }

    function activateCompany(uint256 _id) external onlyAdmin {
        require(_id > 0 && _id <= companyCounter, "Validation: Invalid company ID");
        require(!companies[_id].active, "State: Company already active");
        companies[_id].active = true;
        emit CompanyStatusChanged(_id, true);
    }

    // =====================================================
    // 3. ACCESS REQUEST QUEUE (GOVERNED BY ADMIN)
    // =====================================================

    function requestAccess(
        string memory _entityType,
        string memory _name,
        string memory _proposedCode,
        string memory _contactEmail,
        address _wallet
    ) external returns (uint256) {
        require(bytes(_name).length > 0, "Validation: Name required");
        require(bytes(_proposedCode).length > 0, "Validation: Code required");
        require(bytes(_contactEmail).length > 0, "Validation: Email required");

        accessRequestCounter++;
        uint256 reqId = accessRequestCounter;

        accessRequests[reqId] = AccessRequest({
            requestId: reqId,
            entityType: _entityType,
            name: _name,
            proposedCode: _proposedCode,
            contactEmail: _contactEmail,
            wallet: _wallet == address(0) ? msg.sender : _wallet,
            approved: false,
            timestamp: block.timestamp
        });

        emit AccessRequested(reqId, _entityType, _name, _proposedCode);
        return reqId;
    }

    function approveAccessRequest(uint256 _requestId) external onlyAdmin returns (uint256) {
        require(_requestId > 0 && _requestId <= accessRequestCounter, "Invalid request ID");
        AccessRequest storage req = accessRequests[_requestId];
        require(!req.approved, "Request already approved");

        req.approved = true;
        uint256 entityId = 0;

        if (keccak256(bytes(req.entityType)) == keccak256(bytes("university"))) {
            entityId = registerUniversity(req.name, req.proposedCode, "VTU", req.wallet);
        } else {
            entityId = registerCompany(req.name, req.proposedCode, req.wallet);
        }

        emit AccessRequestApproved(_requestId, req.entityType, entityId);
        return entityId;
    }

    // =====================================================
    // 4. STUDENT REGISTRATION (RELAYER ONLY, COLLEGE BINDING)
    // =====================================================

    /**
     * @dev Registers student bound to a specific college.
     * Enforces:
     * - Only authorized relayer can invoke
     * - USN format valid
     * - USN college code EQUALS registering college's code
     * - Stores only cryptographic marksHash on-chain (no plaintext percentage)
     */
    function registerStudent(
        uint256 _collegeId,
        string memory _usn,
        string memory _name,
        string memory _course,
        uint16 _graduationYear,
        bytes32 _marksHash
    ) public onlyAuthorizedRelayer returns (uint256) {
        require(_collegeId > 0 && _collegeId <= universityCounter, "Invalid college ID");
        require(universities[_collegeId].active, "College inactive");

        // Verify USN format and extract college code
        string memory usnCollege = parseAndValidateUSN(_usn);
        require(
            keccak256(bytes(usnCollege)) == keccak256(bytes(universities[_collegeId].universityCode)),
            "Auth: USN college code does not match registering college"
        );

        require(bytes(_usn).length > 0, "Validation: USN cannot be empty");
        require(bytes(_name).length > 0, "Validation: Student name cannot be empty");
        require(usnToStudentId[_usn] == 0, "Conflict: USN already registered");
        require(_marksHash != bytes32(0), "Validation: Marks hash cannot be empty");
        require(_graduationYear >= 1990 && _graduationYear <= 2100, "Validation: Invalid graduation year");

        studentCounter++;
        uint256 newStudentId = studentCounter;

        students[newStudentId] = Student({
            id: newStudentId,
            usn: _usn,
            name: _name,
            course: _course,
            graduationYear: _graduationYear,
            marksHash: _marksHash,
            universityId: _collegeId,
            exists: true
        });

        usnToStudentId[_usn] = newStudentId;

        emit StudentRegistered(newStudentId, _usn, _name, _collegeId, _marksHash);
        return newStudentId;
    }

    function registerStudentByUniversity(
        uint256 _collegeId,
        string memory _usn,
        string memory _name,
        string memory _course,
        uint16 _graduationYear,
        bytes32 _marksHash
    ) external onlyAuthorizedRelayer returns (uint256) {
        return registerStudent(_collegeId, _usn, _name, _course, _graduationYear, _marksHash);
    }

    /**
     * @dev Updates marks hash for an existing registered student when a new version is created.
     * Reuses existing marksHash storage without data bloat.
     * Enforces:
     * - Only authorized relayer can invoke
     * - College ID matches student's bound universityId
     * - New marks hash cannot be empty
     */
    function updateStudentMarks(
        uint256 _collegeId,
        string memory _usn,
        bytes32 _newMarkHash
    ) external onlyAuthorizedRelayer returns (bool) {
        require(_collegeId > 0 && _collegeId <= universityCounter, "Invalid college ID");
        require(universities[_collegeId].active, "College inactive");
        uint256 sId = usnToStudentId[_usn];
        require(sId != 0, "Student not found");
        require(students[sId].universityId == _collegeId, "Auth: Student belongs to different college");
        require(_newMarkHash != bytes32(0), "Validation: Marks hash cannot be empty");

        bytes32 oldHash = students[sId].marksHash;
        students[sId].marksHash = _newMarkHash;

        emit StudentMarksUpdated(sId, _usn, _collegeId, oldHash, _newMarkHash, block.timestamp);
        return true;
    }

    // =====================================================
    // 5. CREDENTIAL ISSUANCE & LIFECYCLE (RELAYER ONLY, COLLEGE BINDING)
    // =====================================================

    /**
     * @dev Issues credential for a student.
     * Enforces:
     * - Only authorized relayer can invoke
     * - Student belongs to the acting college (admin bypass removed)
     */
    function issueCredential(
        uint256 _collegeId,
        uint256 _studentId,
        string memory _documentType,
        bytes32 _documentHash,
        string memory _ipfsCID
    ) public onlyAuthorizedRelayer returns (uint256) {
        require(_collegeId > 0 && _collegeId <= universityCounter, "Invalid college ID");
        require(universities[_collegeId].active, "College inactive");
        require(_studentId > 0 && _studentId <= studentCounter, "Validation: Student does not exist");
        require(bytes(_documentType).length > 0, "Validation: Document type cannot be empty");
        require(_documentHash != bytes32(0), "Validation: Document hash cannot be empty");
        require(bytes(_ipfsCID).length > 0, "Validation: IPFS CID cannot be empty");

        // CRITICAL CHECK: Student's college MUST match acting college
        require(students[_studentId].universityId == _collegeId, "Auth: Student belongs to different college");

        credentialCounter++;
        uint256 newCredentialId = credentialCounter;
        uint256 currentVersion = studentToCredentials[_studentId].length + 1;

        credentials[newCredentialId] = Credential({
            credentialId: newCredentialId,
            studentId: _studentId,
            universityId: _collegeId,
            documentType: _documentType,
            documentHash: _documentHash,
            ipfsCID: _ipfsCID,
            issuedAt: block.timestamp,
            version: currentVersion,
            status: CredentialStatus.Active,
            exists: true
        });

        studentToCredentials[_studentId].push(newCredentialId);

        emit CredentialIssued(
            newCredentialId,
            _studentId,
            _collegeId,
            _documentType,
            _documentHash,
            _ipfsCID,
            currentVersion
        );

        return newCredentialId;
    }

    function issueCredentialByUniversity(
        uint256 _collegeId,
        uint256 _studentId,
        string memory _documentType,
        bytes32 _documentHash,
        string memory _ipfsCID
    ) external onlyAuthorizedRelayer returns (uint256) {
        return issueCredential(_collegeId, _studentId, _documentType, _documentHash, _ipfsCID);
    }

    function suspendCredential(uint256 _collegeId, uint256 _credentialId, string memory _reason) external onlyAuthorizedRelayer {
        require(_credentialId > 0 && _credentialId <= credentialCounter, "Validation: Credential does not exist");
        Credential storage cred = credentials[_credentialId];
        require(cred.universityId == _collegeId, "Auth: Only issuing college can suspend");
        require(cred.status == CredentialStatus.Active, "State: Credential not active");

        cred.status = CredentialStatus.Suspended;
        emit CredentialSuspended(_credentialId, _collegeId, _reason);
        emit CredentialStatusChanged(_credentialId, CredentialStatus.Suspended);
    }

    function reactivateCredential(uint256 _collegeId, uint256 _credentialId) external onlyAuthorizedRelayer {
        require(_credentialId > 0 && _credentialId <= credentialCounter, "Validation: Credential does not exist");
        Credential storage cred = credentials[_credentialId];
        require(cred.universityId == _collegeId, "Auth: Only issuing college can reactivate");
        require(cred.status == CredentialStatus.Suspended, "State: Credential not suspended");

        cred.status = CredentialStatus.Active;
        emit CredentialReactivated(_credentialId, _collegeId);
        emit CredentialStatusChanged(_credentialId, CredentialStatus.Active);
    }

    function revokeCredential(uint256 _collegeId, uint256 _credentialId, string memory _reason) external onlyAuthorizedRelayer {
        require(_credentialId > 0 && _credentialId <= credentialCounter, "Validation: Credential does not exist");
        Credential storage cred = credentials[_credentialId];
        require(cred.universityId == _collegeId, "Auth: Only issuing college can revoke");
        require(cred.status == CredentialStatus.Active || cred.status == CredentialStatus.Suspended, "State: Already revoked");

        cred.status = CredentialStatus.Revoked;
        emit CredentialRevoked(_credentialId, _collegeId, _reason);
        emit CredentialStatusChanged(_credentialId, CredentialStatus.Revoked);
    }

    // =====================================================
    // 6. STUDENT SELF-UPLOADED ACHIEVEMENTS & COLLEGE REVIEW
    // =====================================================

    function submitAchievement(
        string memory _usn,
        string memory _title,
        string memory _issuerOrg,
        string memory _category,
        bytes32 _documentHash,
        string memory _ipfsCID
    ) external onlyAuthorizedRelayer returns (uint256) {
        uint256 sId = usnToStudentId[_usn];
        require(sId != 0, "Student not found");
        require(bytes(_title).length > 0, "Title required");
        require(bytes(_ipfsCID).length > 0, "IPFS CID required");

        achievementCounter++;
        uint256 newId = achievementCounter;

        achievements[newId] = Achievement({
            achievementId: newId,
            studentId: sId,
            title: _title,
            issuerOrg: _issuerOrg,
            category: _category,
            documentHash: _documentHash,
            ipfsCID: _ipfsCID,
            submittedAt: block.timestamp,
            reviewedAt: 0,
            reviewingUniversityId: 0,
            status: AchievementStatus.PendingReview,
            reviewRemarks: "",
            exists: true
        });

        studentToAchievements[sId].push(newId);

        emit AchievementSubmitted(newId, sId, _title);
        return newId;
    }

    function reviewAchievement(
        uint256 _achievementId,
        uint256 _collegeId,
        AchievementStatus _newStatus,
        string memory _remarks
    ) external onlyAuthorizedRelayer {
        require(_achievementId > 0 && _achievementId <= achievementCounter, "Invalid achievement ID");
        require(_collegeId > 0 && _collegeId <= universityCounter, "Invalid college ID");
        require(universities[_collegeId].active, "College inactive");
        require(_newStatus != AchievementStatus.PendingReview, "Must verify or reject");

        Achievement storage ach = achievements[_achievementId];
        uint256 sId = ach.studentId;

        // CRITICAL CHECK: Student must belong to the reviewing college
        require(students[sId].universityId == _collegeId, "Auth: Student belongs to different college");

        ach.status = _newStatus;
        ach.reviewedAt = block.timestamp;
        ach.reviewingUniversityId = _collegeId;
        ach.reviewRemarks = _remarks;

        emit AchievementReviewed(_achievementId, _collegeId, _newStatus, _remarks);
    }

    // =====================================================
    // 7. VERIFICATION SYSTEM (COMPANY & PUBLIC AUDIT)
    // =====================================================

    function recordVerificationByCompany(
        uint256 _companyId,
        uint256 _credentialId,
        bool _hashMatched,
        bool _isAuthentic,
        string memory _documentType
    ) external onlyAuthorizedRelayer returns (uint256) {
        require(_companyId > 0 && _companyId <= companyCounter, "Invalid company ID");
        require(companies[_companyId].active, "Company inactive");

        verificationCounter++;
        uint256 vId = verificationCounter;

        verifications[vId] = Verification({
            verificationId: vId,
            credentialId: _credentialId,
            companyId: _companyId,
            documentType: _documentType,
            hashMatched: _hashMatched,
            verified: _isAuthentic,
            timestamp: block.timestamp
        });

        companyToVerifications[_companyId].push(vId);
        if (_credentialId > 0) {
            credentialToVerifications[_credentialId].push(vId);
        }

        emit CredentialVerified(
            vId,
            _credentialId,
            _companyId,
            _documentType,
            _hashMatched,
            _isAuthentic,
            block.timestamp
        );

        return vId;
    }

    // =====================================================
    // 8. PUBLIC VIEW FUNCTIONS
    // =====================================================

    function getStudentByUSN(string memory _usn) external view returns (
        uint256 id,
        string memory usn,
        string memory name,
        string memory course,
        uint16 graduationYear,
        bytes32 marksHash,
        uint256 universityId,
        bool exists
    ) {
        uint256 sId = usnToStudentId[_usn];
        require(sId != 0, "Student not found");
        Student memory s = students[sId];
        return (s.id, s.usn, s.name, s.course, s.graduationYear, s.marksHash, s.universityId, s.exists);
    }

    function getStudentId(string memory _usn) external view returns (uint256) {
        return usnToStudentId[_usn];
    }

    function getCredential(uint256 _credentialId) external view returns (
        uint256 credentialId,
        uint256 studentId,
        uint256 universityId,
        string memory documentType,
        bytes32 documentHash,
        string memory ipfsCID,
        uint256 issuedAt,
        uint256 version,
        CredentialStatus status,
        bool exists
    ) {
        require(_credentialId > 0 && _credentialId <= credentialCounter, "Invalid credential ID");
        Credential memory c = credentials[_credentialId];
        return (
            c.credentialId,
            c.studentId,
            c.universityId,
            c.documentType,
            c.documentHash,
            c.ipfsCID,
            c.issuedAt,
            c.version,
            c.status,
            c.exists
        );
    }

    function getCredentialsByStudent(uint256 _studentId) external view returns (uint256[] memory) {
        require(_studentId > 0 && _studentId <= studentCounter, "Invalid student ID");
        return studentToCredentials[_studentId];
    }

    function getAchievement(uint256 _achievementId) external view returns (
        uint256 achievementId,
        uint256 studentId,
        string memory title,
        string memory issuerOrg,
        string memory category,
        bytes32 documentHash,
        string memory ipfsCID,
        uint256 submittedAt,
        uint256 reviewedAt,
        uint256 reviewingUniversityId,
        AchievementStatus status,
        string memory reviewRemarks,
        bool exists
    ) {
        require(_achievementId > 0 && _achievementId <= achievementCounter, "Invalid achievement ID");
        Achievement memory a = achievements[_achievementId];
        return (
            a.achievementId,
            a.studentId,
            a.title,
            a.issuerOrg,
            a.category,
            a.documentHash,
            a.ipfsCID,
            a.submittedAt,
            a.reviewedAt,
            a.reviewingUniversityId,
            a.status,
            a.reviewRemarks,
            a.exists
        );
    }

    function getAchievementsByStudent(uint256 _studentId) external view returns (uint256[] memory) {
        require(_studentId > 0 && _studentId <= studentCounter, "Invalid student ID");
        return studentToAchievements[_studentId];
    }

    function getUniversity(uint256 _id) external view returns (
        uint256 id,
        string memory name,
        string memory universityCode,
        string memory affiliatingUniversity,
        address wallet,
        bool active
    ) {
        require(_id > 0 && _id <= universityCounter, "Invalid university ID");
        University memory u = universities[_id];
        return (u.id, u.name, u.universityCode, u.affiliatingUniversity, u.wallet, u.active);
    }

    function getCompany(uint256 _id) external view returns (
        uint256 id,
        string memory name,
        string memory companyCode,
        address wallet,
        bool active
    ) {
        require(_id > 0 && _id <= companyCounter, "Invalid company ID");
        Company memory c = companies[_id];
        return (c.id, c.name, c.companyCode, c.wallet, c.active);
    }

    function getAccessRequest(uint256 _requestId) external view returns (
        uint256 requestId,
        string memory entityType,
        string memory name,
        string memory proposedCode,
        string memory contactEmail,
        address wallet,
        bool approved,
        uint256 timestamp
    ) {
        require(_requestId > 0 && _requestId <= accessRequestCounter, "Invalid request ID");
        AccessRequest memory r = accessRequests[_requestId];
        return (
            r.requestId,
            r.entityType,
            r.name,
            r.proposedCode,
            r.contactEmail,
            r.wallet,
            r.approved,
            r.timestamp
        );
    }

    function getAccessRequestCount() external view returns (uint256) {
        return accessRequestCounter;
    }

    function getVerification(uint256 _verificationId) external view returns (
        uint256 verificationId,
        uint256 credentialId,
        uint256 companyId,
        string memory documentType,
        bool hashMatched,
        bool verified,
        uint256 timestamp
    ) {
        require(_verificationId > 0 && _verificationId <= verificationCounter, "Invalid verification ID");
        Verification memory v = verifications[_verificationId];
        return (
            v.verificationId,
            v.credentialId,
            v.companyId,
            v.documentType,
            v.hashMatched,
            v.verified,
            v.timestamp
        );
    }

    function getVerificationsByCompany(uint256 _companyId) external view returns (uint256[] memory) {
        require(_companyId > 0 && _companyId <= companyCounter, "Invalid company ID");
        return companyToVerifications[_companyId];
    }

    function getVerificationsByCredential(uint256 _credentialId) external view returns (uint256[] memory) {
        require(_credentialId > 0 && _credentialId <= credentialCounter, "Invalid credential ID");
        return credentialToVerifications[_credentialId];
    }

    function getCounters() external view returns (
        uint256 totalUniversities,
        uint256 totalStudents,
        uint256 totalCredentials,
        uint256 totalCompanies,
        uint256 totalVerifications
    ) {
        return (
            universityCounter,
            studentCounter,
            credentialCounter,
            companyCounter,
            verificationCounter
        );
    }

    function getAllStats() external view returns (
        uint256 totalUniversities,
        uint256 totalStudents,
        uint256 totalCredentials,
        uint256 totalAchievements,
        uint256 totalCompanies,
        uint256 totalVerifications,
        uint256 totalRequests
    ) {
        return (
            universityCounter,
            studentCounter,
            credentialCounter,
            achievementCounter,
            companyCounter,
            verificationCounter,
            accessRequestCounter
        );
    }
}
