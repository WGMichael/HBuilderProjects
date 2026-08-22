
const Vo_StatusType = {
	Open: 1,
	Lock: 2,
	Dispose: 3,
	Finish:4
}

const UserVote_status = {
	Untreated : -1,
	Lock : 0,
	Miss: 1,   //
	BinGo: 2,   //
	CanCle: 3
}

const Exp_ChangeType = {
	Vo_Create_Save: 1,   //创建抵ya 包含 2
	Vo_Create_Need: 2,   //创建花费
	Vo_YA_Cost: 3,			//YA 花费
	Vo_Result_Back_Client : 4,	//包括本
	Vo_Result_Back_Client_overrange : 5,
	Vo_Result_Back_Create_Ben : 6,
	Vo_Result_Back_Create: 7, //包括本
	Vo_Dispose_Back_Create : 8,
	Vo_Dispose_Back_Client : 9,
	Vo_Dispose_Back_Ben : 10,
	Add : 20,
	Reduce : 21
}

const Error_Code = {
	Token_Expired : 10001
}

export default {
	Vo_StatusType : Vo_StatusType,
	Exp_ChangeType : Exp_ChangeType,
	UserVote_status : UserVote_status,
	Error_Code : Error_Code
}

