-- MySQL dump 10.13  Distrib 8.0.42, for macos15 (x86_64)
--
-- Host: localhost    Database: pandployer
-- ------------------------------------------------------
-- Server version	9.4.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `Candidates`
--

DROP TABLE IF EXISTS `Candidates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Candidates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `resume_id` int NOT NULL,
  `interview` varchar(255) NOT NULL,
  `f_name` varchar(45) NOT NULL,
  `l_name` varchar(45) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `resume_id_UNIQUE` (`resume_id`),
  KEY `resume_id` (`resume_id`),
  CONSTRAINT `fk_candidates_resume` FOREIGN KEY (`resume_id`) REFERENCES `Resume_pdfs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `GroupConfirmations`
--
-- Server-side record of who has confirmed the group's resume selection in
-- res-review-group. It used to live only in React state, so a refresh reset it
-- to nothing and a student who had already confirmed could not confirm again.
-- Added by migrations/004-group-confirmations.sql; keep the two in step.
--

DROP TABLE IF EXISTS `GroupConfirmations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `GroupConfirmations` (
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  `student_id` int NOT NULL,
  `confirmed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`, `class`, `student_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `GroupConfirmations_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Step_Completion`
--
-- Durable per-student step completion, so the group barrier survives an API
-- restart. It used to live in `global.completedResReview`, a plain object in
-- the process; a restart, a reconnect, or a student offline at the instant of
-- release each stranded the whole group permanently. Added by
-- migrations/005-step-completion.sql; keep the two in step.
--

DROP TABLE IF EXISTS `Step_Completion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Step_Completion` (
  `student_id` int NOT NULL,
  `class` int NOT NULL,
  `group_id` int NOT NULL,
  `step` enum('none','job_description','res_1','res_2','interview','offer','employer') NOT NULL,
  `completed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`, `class`, `group_id`, `step`),
  KEY `barrier_lookup` (`class`, `group_id`, `step`),
  CONSTRAINT `Step_Completion_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `GroupsInfo`
--

DROP TABLE IF EXISTS `GroupsInfo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `GroupsInfo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `started` tinyint NOT NULL DEFAULT '0',
  `group_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_class_group` (`class_id`,`id`),
  CONSTRAINT `groupsinfo_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `Moderator` (`crn`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Interview_Status`
--

DROP TABLE IF EXISTS `Interview_Status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Interview_Status` (
  `student_id` int NOT NULL,
  `finished` tinyint NOT NULL DEFAULT '0',
  `group_id` varchar(45) NOT NULL,
  `class` int NOT NULL,
  PRIMARY KEY (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Interview_vids`
--

DROP TABLE IF EXISTS `Interview_vids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Interview_vids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `resume_id` int NOT NULL,
  `video_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_interview_vids_resume` (`resume_id`),
  CONSTRAINT `fk_interview_vids_resume` FOREIGN KEY (`resume_id`) REFERENCES `Resume_pdfs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `InterviewPage`
--

DROP TABLE IF EXISTS `InterviewPage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `InterviewPage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  `question1` int NOT NULL,
  `question2` int NOT NULL,
  `question3` int NOT NULL,
  `question4` int NOT NULL,
  `candidate_id` int NOT NULL,
  `checked` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_student_candidate` (`student_id`,`candidate_id`),
  KEY `student_id` (`student_id`),
  KEY `candidate_id` (`candidate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `InterviewPopup`
--

DROP TABLE IF EXISTS `InterviewPopup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `InterviewPopup` (
  `candidate_id` int NOT NULL,
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  `question1` int NOT NULL,
  `question2` int NOT NULL,
  `question3` int NOT NULL,
  `question4` int NOT NULL,
  PRIMARY KEY (`candidate_id`,`group_id`,`class`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Job_Assignment`
--

DROP TABLE IF EXISTS `Job_Assignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Job_Assignment` (
  `group` int NOT NULL,
  `class` int NOT NULL,
  `job` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`group`,`class`),
  KEY `job_fk_idx` (`class`,`job`),
  KEY `job_idx` (`job`),
  KEY `job_class_idx` (`job`,`class`),
  CONSTRAINT `job_fk` FOREIGN KEY (`job`, `class`) REFERENCES `job_descriptions` (`title`, `class_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_descriptions`
--

DROP TABLE IF EXISTS `job_descriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_descriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `class_id` int NOT NULL,
  `extracted_text` mediumtext,
  PRIMARY KEY (`id`),
  UNIQUE KEY `title_class_unique` (`title`,`class_id`),
  KEY `job_descriptions_class_fk_idx` (`class_id`),
  CONSTRAINT `job_descriptions_class_fk` FOREIGN KEY (`class_id`) REFERENCES `Moderator` (`crn`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `MakeOfferPage`
--

DROP TABLE IF EXISTS `MakeOfferPage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `MakeOfferPage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `selected_candidate` int NOT NULL,
  `timespent` int NOT NULL,
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `selected_candidate` (`selected_candidate`),
  KEY `group_id` (`group_id`),
  CONSTRAINT `MakeOfferPage_ibfk_1` FOREIGN KEY (`selected_candidate`) REFERENCES `Candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Moderator`
--

DROP TABLE IF EXISTS `Moderator`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Moderator` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_email` varchar(45) NOT NULL,
  `crn` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crn_UNIQUE` (`crn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Notes`
--

DROP TABLE IF EXISTS `Notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_email` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_email` (`user_email`),
  CONSTRAINT `notes_ibfk_1` FOREIGN KEY (`user_email`) REFERENCES `Users` (`email`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Offer_Status`
--

DROP TABLE IF EXISTS `Offer_Status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Offer_Status` (
  `student_id` int NOT NULL,
  `clicked` tinyint NOT NULL DEFAULT '0',
  `group_id` varchar(45) NOT NULL,
  `class` int NOT NULL,
  PRIMARY KEY (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Offers`
--

DROP TABLE IF EXISTS `Offers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Offers` (
  `class_id` int NOT NULL,
  `group_id` int NOT NULL,
  `candidate_id` int NOT NULL,
  `status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  `id` int NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  -- One offer per group per section. Without this, two members clicking submit
  -- at the same moment inserted two pending rows and the professor's list showed
  -- the group twice; accepting one left the other pending for the rest of class.
  -- createOffer relies on this key to upsert. See migrations/002.
  UNIQUE KEY `uniq_offer_per_group` (`class_id`, `group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Progress`
--

DROP TABLE IF EXISTS `Progress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Progress` (
  `crn` int NOT NULL,
  `group_id` int NOT NULL,
  `step` enum('none','job_description','res_1','res_2','interview','offer','employer') DEFAULT NULL,
  `email` varchar(45) NOT NULL,
  PRIMARY KEY (`email`),
  UNIQUE KEY `email_UNIQUE` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Res2_Status`
--

DROP TABLE IF EXISTS `Res2_Status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Res2_Status` (
  `student_id` int NOT NULL,
  `finished` tinyint NOT NULL DEFAULT '0',
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  PRIMARY KEY (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Resume`
--

DROP TABLE IF EXISTS `Resume`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Resume` (
  `student_id` int NOT NULL,
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  `timespent` int NOT NULL,
  `resume_number` int NOT NULL,
  `vote` enum('yes','no','unanswered') NOT NULL,
  -- GROUP-level, not per student, despite the per-student row grain. `checked`
  -- is "this group shortlisted this resume": the `check` socket handler updates
  -- every row for (group_id, class, resume_number) with no student_id, so one
  -- member ticking the box ticks it for the team, which is the point. The value
  -- is therefore duplicated across the group's rows.
  -- Read it as MAX(checked) GROUP BY resume_number. Taking it off a single row
  -- is how a student who votes after the group shortlisted a resume — their new
  -- row carries the DEFAULT 0 — unticks it for everyone. migrations/003 brings
  -- existing rows back into line.
  `checked` tinyint(1) NOT NULL DEFAULT '0',
  `id` int NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  -- One row per student per resume. The vote writer uses ON DUPLICATE KEY
  -- UPDATE, which silently did nothing without this: the only keys were the
  -- auto-increment id and a non-unique index, so every submission appended a
  -- row and the group's tally counted the same student repeatedly.
  UNIQUE KEY `uniq_resume_vote` (`student_id`, `group_id`, `class`, `resume_number`),
  KEY `student_id` (`student_id`),
  -- The vote INSERT and the `check` socket handler find a group's rows for one
  -- resume by these columns. migrations/007.
  KEY `group_resume` (`group_id`, `class`, `resume_number`),
  CONSTRAINT `Resume_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Resume_pdfs`
--

DROP TABLE IF EXISTS `Resume_pdfs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Resume_pdfs` (
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `title` varchar(255) NOT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `extracted_text` mediumtext,
  PRIMARY KEY (`id`),
  UNIQUE KEY `title_class_unique` (`title`,`class_id`),
  KEY `resume_pdfs_class_fk_idx` (`class_id`),
  CONSTRAINT `resume_pdfs_class_fk` FOREIGN KEY (`class_id`) REFERENCES `Moderator` (`crn`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Resumepage`
--

DROP TABLE IF EXISTS `Resumepage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Resumepage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `visited` datetime DEFAULT CURRENT_TIMESTAMP,
  `student_id` int NOT NULL,
  `timespent` int NOT NULL,
  `vote` enum('yes','no','unanswered') DEFAULT 'unanswered',
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `Resumepage_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Resumepage2`
--

DROP TABLE IF EXISTS `Resumepage2`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Resumepage2` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vote1` int NOT NULL,
  `vote2` int NOT NULL,
  `vote3` int NOT NULL,
  `vote4` int NOT NULL,
  `timespent` int NOT NULL,
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Users`
--

DROP TABLE IF EXISTS `Users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `f_name` varchar(50) DEFAULT NULL,
  `l_name` varchar(50) DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `affiliation` enum('student','admin','none') NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `group_id` int DEFAULT NULL,
  `class` int DEFAULT NULL,
  `current_page` enum('dashboard','resumepage','resumepage2','jobdes','interviewpage','makeofferpage') DEFAULT NULL,
  `seen` tinyint NOT NULL DEFAULT '0',
  `present_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `WaitingFacts`
--

DROP TABLE IF EXISTS `WaitingFacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `WaitingFacts` (
  `class_id` int NOT NULL,
  `one` text,
  `two` text,
  `three` text,
  PRIMARY KEY (`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-11-19 11:04:43
